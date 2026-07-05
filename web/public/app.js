
(function () {
  "use strict";

  // ---------- State ----------
  const STORE_KEY = "familyTree.v1";
  let state = { people: {}, nextId: 1 };
  let selectedId = null;      // person open in editor
  let linkMode = null;        // { type: 'parent'|'child'|'spouse'|'link', sourceId }
  const view = { x: 40, y: 40, scale: 1 };

  const el = {
    stage: document.getElementById("stage"),
    canvas: document.getElementById("canvas"),
    nodes: document.getElementById("nodes"),
    edges: document.getElementById("edges"),
    empty: document.getElementById("empty"),
    panel: document.getElementById("panel"),
    panelTitle: document.getElementById("panelTitle"),
    relHint: document.getElementById("relHint"),
    fileInput: document.getElementById("fileInput"),
    photoPreview: document.getElementById("photoPreview"),
    photoInput: document.getElementById("photoInput"),
    photoRemove: document.getElementById("photoRemove"),
  };
  const f = {
    name: document.getElementById("fName"),
    birth: document.getElementById("fBirth"),
    death: document.getElementById("fDeath"),
    gender: document.getElementById("fGender"),
    notes: document.getElementById("fNotes"),
  };

  // ---------- Persistence (cloud) ----------
  // Debounced save to the server. Each signed-in user has one tree.
  let saveTimer = null, savePending = false;
  function save() {
    savePending = true;
    setSaveStatus("saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, 600);
  }
  async function flushSave() {
    if (!savePending) return;
    savePending = false;
    try {
      const res = await fetch("/api/tree", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (res.status === 401) return redirectToLogin();
      if (!res.ok) throw new Error("save failed");
      setSaveStatus("saved");
    } catch (e) {
      setSaveStatus("error");
    }
  }
  // Flush any pending save when leaving the page.
  window.addEventListener("beforeunload", () => {
    if (savePending) navigator.sendBeacon("/api/tree", JSON.stringify(state));
  });
  async function loadFromServer() {
    try {
      const res = await fetch("/api/tree", { cache: "no-store" });
      if (res.status === 401) return redirectToLogin();
      if (res.ok) {
        const data = await res.json();
        if (data && data.people) state = data;
      }
    } catch (e) {}
    if (!state.people) state = { people: {}, nextId: 1 };
  }
  function redirectToLogin() { window.location.href = "/login"; }
  function setSaveStatus(s) {
    const el = document.getElementById("saveStatus");
    if (!el) return;
    el.textContent = s === "saving" ? "Saving…" : s === "saved" ? "All changes saved"
      : s === "error" ? "⚠ Save failed" : "";
    el.dataset.state = s;
  }

  function uid() { return "p" + (state.nextId++); }

  // ---------- Model helpers ----------
  function newPerson(data) {
    const id = uid();
    state.people[id] = Object.assign(
      { id, name: "New person", birth: "", death: "", gender: "unknown",
        notes: "", parents: [], spouses: [] },
      data || {}
    );
    return state.people[id];
  }
  function people() { return Object.values(state.people); }

  function addParentRelation(childId, parentId) {
    const c = state.people[childId];
    if (!c || childId === parentId) return;
    if (!c.parents.includes(parentId)) c.parents.push(parentId);
    // If the child already has another parent, mark the two parents as partners.
    c.parents.slice().forEach((pid) => {
      if (pid !== parentId) linkSpouses(pid, parentId);
    });
    // One-marriage model: the parent's partner co-parents this child too.
    const p = state.people[parentId];
    if (p) p.spouses.slice().forEach((sid) => {
      if (state.people[sid]) syncCoupleChildren(parentId, sid);
    });
  }
  function linkSpouses(a, b) {
    if (a === b) return;
    const pa = state.people[a], pb = state.people[b];
    if (!pa || !pb) return;
    if (!pa.spouses.includes(b)) pa.spouses.push(b);
    if (!pb.spouses.includes(a)) pb.spouses.push(a);
    // One-marriage model: partners share all children between them.
    syncCoupleChildren(a, b);
  }
  // Every child of either partner becomes a child of both. (Assumes each
  // person has a single marriage and children come from that marriage.)
  function syncCoupleChildren(a, b) {
    const kids = new Set();
    childrenOf(a).forEach((c) => kids.add(c.id));
    childrenOf(b).forEach((c) => kids.add(c.id));
    kids.forEach((cid) => {
      const c = state.people[cid];
      if (!c) return;
      if (!c.parents.includes(a)) c.parents.push(a);
      if (!c.parents.includes(b)) c.parents.push(b);
    });
  }
  function childrenOf(id) {
    return people().filter((p) => p.parents.includes(id));
  }
  function removePerson(id) {
    delete state.people[id];
    people().forEach((p) => {
      p.parents = p.parents.filter((x) => x !== id);
      p.spouses = p.spouses.filter((x) => x !== id);
    });
  }

  // ---------- Layout ----------
  // Assign generation depth (roots at top), then order & position couples/children.
  const CARD_W = 190, CARD_H = 92, H_GAP = 28, V_GAP = 92, COUPLE_GAP = 16;

  function computeLayout() {
    const ppl = people();
    const pos = {};       // id -> {x,y}
    if (ppl.length === 0) return { pos, width: 0, height: 0 };

    // 1. depth via longest path from a root
    const depth = {};
    function calcDepth(id, seen) {
      if (depth[id] != null) return depth[id];
      if (seen.has(id)) return 0; // cycle guard
      seen.add(id);
      const p = state.people[id];
      let d = 0;
      p.parents.forEach((pid) => {
        if (state.people[pid]) d = Math.max(d, calcDepth(pid, seen) + 1);
      });
      seen.delete(id);
      depth[id] = d;
      return d;
    }
    ppl.forEach((p) => calcDepth(p.id, new Set()));

    // 1b. Solve generation constraints so every connector spans exactly one
    // row (a longer edge would cut through cards on the rows in between):
    //   - partners share a row
    //   - siblings share a row
    //   - children sit below parents
    //   - parents are pulled down to sit directly above their children
    // Every rule only moves people down, so this reaches a fixed point; the
    // guard covers pathological data (e.g. cyclic imports).
    for (let guard = 0; guard < 300; guard++) {
      let changed = false;
      const sink = (id, d) => {
        if (depth[id] < d) { depth[id] = d; changed = true; }
      };
      ppl.forEach((p) => {
        p.spouses.forEach((sid) => {
          if (!state.people[sid]) return;
          const m = Math.max(depth[p.id], depth[sid]);
          sink(p.id, m); sink(sid, m);
        });
        const kids = childrenOf(p.id);
        if (!kids.length) return;
        let deepest = -Infinity;
        kids.forEach((c) => { sink(c.id, depth[p.id] + 1); deepest = Math.max(deepest, depth[c.id]); });
        kids.forEach((c) => sink(c.id, deepest));          // siblings level
        sink(p.id, Math.min(...kids.map((c) => depth[c.id])) - 1); // parent right above
      });
      if (!changed) break;
    }
    // 1c. Split into connected components. Each family group is laid out
    // independently and placed side by side, so unrelated people can never
    // interleave with (or float inside) another family's block.
    const compOf = new Map();
    const comps = [];
    ppl.forEach((p) => {
      if (compOf.has(p.id)) return;
      const members = [];
      const stack = [p.id];
      compOf.set(p.id, comps.length);
      while (stack.length) {
        const id = stack.pop();
        members.push(state.people[id]);
        const q = state.people[id];
        [...q.parents, ...q.spouses, ...childrenOf(id).map((c) => c.id)].forEach((nid) => {
          if (state.people[nid] && !compOf.has(nid)) { compOf.set(nid, comps.length); stack.push(nid); }
        });
      }
      comps.push(members);
    });
    // Per component: remap used depths to consecutive rows (top-aligned).
    comps.forEach((members) => {
      const used = [...new Set(members.map((p) => depth[p.id]))].sort((a, b) => a - b);
      const remap = new Map(used.map((d, i) => [d, i]));
      members.forEach((p) => { depth[p.id] = remap.get(depth[p.id]); });
    });

    // Lay out each component (biggest first), then shift them side by side.
    const GUTTER = CARD_W / 2;
    comps.sort((a, b) => b.length - a.length);
    let offX = 0, width = 0, height = 0;
    comps.forEach((members) => {
      const r = layoutComponent(members);
      members.forEach((p) => { pos[p.id] = { x: r.pos[p.id].x + offX, y: r.pos[p.id].y }; });
      offX += r.width + GUTTER;
      width = Math.max(width, offX - GUTTER);
      height = Math.max(height, r.height);
    });
    return { pos, width, height };

    function layoutComponent(members) {
    const pos = {};
    // 2. group into "family units": a couple (or single) sits together.
    const byDepth = {};
    members.forEach((p) => { (byDepth[depth[p.id]] = byDepth[depth[p.id]] || []).push(p.id); });
    // Seed each row oldest-first; later passes keep age order when cost-free.
    const birthKey = (id) => {
      const t = Date.parse(state.people[id].birth);
      return isNaN(t) ? 8.64e15 : t; // unknown birth sorts last
    };
    Object.values(byDepth).forEach((row) => row.sort((a, b) => birthKey(a) - birthKey(b)));

    // Couple pairing: person -> partner on the same row (first spouse found)
    const partnerOf = {};
    members.forEach((p) => {
      const sp = p.spouses.find((s) => state.people[s] && depth[s] === depth[p.id] && !partnerOf[s] && !partnerOf[p.id]);
      if (sp) { partnerOf[p.id] = sp; partnerOf[sp] = p.id; }
    });

    // Ordered units per depth. A unit = [id] or [id, partnerId].
    const maxDepth = Math.max(...members.map((p) => depth[p.id]));
    const unitsByDepth = {};
    const seenUnit = new Set();
    for (let d = 0; d <= maxDepth; d++) {
      const units = [];
      (byDepth[d] || []).forEach((id) => {
        if (seenUnit.has(id)) return;
        if (partnerOf[id]) {
          units.push([id, partnerOf[id]]);
          seenUnit.add(id); seenUnit.add(partnerOf[id]);
        } else {
          units.push([id]);
          seenUnit.add(id);
        }
      });
      unitsByDepth[d] = units;
    }

    // 3. Position units with an iterative barycenter method. Each pass pulls a
    //    unit toward the center of its parents (down) and children (up); rows
    //    are then compacted with isotonic regression (PAVA) so overlapping
    //    units spread out symmetrically around their desired center instead of
    //    all being pushed to one side. This keeps the tree balanced whether it
    //    fans out upward (ancestors) or downward (descendants).
    const unitWidth = (u) => u.length === 2 ? CARD_W * 2 + COUPLE_GAP : CARD_W;
    const unitX = new Map(); // unit key -> left x
    const unitKey = (u) => u; // maps are keyed by the unit array itself

    // Map each person to their unit, then build unit-level adjacency.
    const unitByMember = new Map();
    for (let d = 0; d <= maxDepth; d++)
      unitsByDepth[d].forEach((u) => u.forEach((id) => unitByMember.set(id, u)));
    const childUnitsOf = new Map();
    const parentUnitsOf = new Map();
    for (let d = 0; d <= maxDepth; d++) {
      unitsByDepth[d].forEach((u) => {
        const kids = new Set(), par = new Set();
        u.forEach((mid) => {
          childrenOf(mid).forEach((c) => { const cu = unitByMember.get(c.id); if (cu && cu !== u) kids.add(cu); });
          state.people[mid].parents.forEach((pid) => { const pu = unitByMember.get(pid); if (pu && pu !== u) par.add(pu); });
        });
        childUnitsOf.set(unitKey(u), [...kids]);
        parentUnitsOf.set(unitKey(u), [...par]);
      });
    }

    // 2b. Order units within each generation to reduce edge crossings, so a
    //     newly added sibling sits next to the family it belongs to instead of
    //     being stranded on the far side (where its connector would cross the
    //     tree and look like it descends from the in-laws). Barycenter method:
    //     repeatedly reorder each row by the average slot of its neighbours in
    //     the adjacent rows, sweeping down then up until it settles.
    {
      const bary = (u, rel, idx) => {
        const vals = rel.get(unitKey(u)).map((o) => idx.get(unitKey(o))).filter((v) => v != null);
        return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
      };
      const reorder = (d, rel) => {
        const idx = new Map();
        for (let dd = 0; dd <= maxDepth; dd++)
          unitsByDepth[dd].forEach((u, i) => idx.set(unitKey(u), i));
        const cur = unitsByDepth[d].map((u, i) => ({ u, i, b: bary(u, rel, idx) }));
        cur.forEach((e) => { if (e.b == null) e.b = e.i; }); // no neighbour: stay put
        cur.sort((a, b) => a.b - b.b || a.i - b.i);
        unitsByDepth[d] = cur.map((e) => e.u);
      };
      for (let pass = 0; pass < 8; pass++) {
        for (let d = 1; d <= maxDepth; d++) reorder(d, parentUnitsOf);
        for (let d = maxDepth - 1; d >= 0; d--) reorder(d, childUnitsOf);
      }
    }

    // 2c. Refine: barycenter ordering is a heuristic and can leave avoidable
    //     crossings. Count the actual parent->child edge crossings between
    //     adjacent rows, then greedily try swapping neighbouring units and
    //     flipping couples (which member sits left) while it helps.
    {
      const crossingsBetween = (dTop, dBot) => {
        const topIdx = new Map();
        unitsByDepth[dTop].forEach((u, i) => u.forEach((id) => topIdx.set(id, i)));
        const edges = [];
        unitsByDepth[dBot].forEach((u, i) => {
          u.forEach((id, m) => {
            const par = state.people[id].parents.filter((pp) => topIdx.has(pp));
            if (!par.length) return;
            const from = par.reduce((s, pp) => s + topIdx.get(pp), 0) / par.length + 0.5;
            const to = i + (u.length === 2 ? (m === 0 ? 0.3 : 0.7) : 0.5);
            edges.push([from, to]);
          });
        });
        let n = 0;
        for (let a = 0; a < edges.length; a++)
          for (let b = a + 1; b < edges.length; b++)
            if ((edges[a][0] - edges[b][0]) * (edges[a][1] - edges[b][1]) < 0) n++;
        return n;
      };
      const rowCost = (d) =>
        (d > 0 ? crossingsBetween(d - 1, d) : 0) +
        (d < maxDepth ? crossingsBetween(d, d + 1) : 0);
      const totalCost = () => {
        let n = 0;
        for (let d = 0; d < maxDepth; d++) n += crossingsBetween(d, d + 1);
        return n;
      };
      for (let pass = 0; pass < 16 && totalCost() > 0; pass++) {
        const allowTies = pass < 8; // walk cost-neutral plateaus early on
        const dir = pass % 2 ? -1 : 1; // alternate plateau direction
        let improved = false;
        for (let d = 0; d <= maxDepth; d++) {
          // flip who sits left in a couple
          unitsByDepth[d].forEach((u) => {
            if (u.length !== 2) return;
            const before = rowCost(d);
            u.reverse();
            const after = rowCost(d);
            if (after < before) improved = true;
            else if (after > before || !allowTies) u.reverse();
          });
          const units = unitsByDepth[d];
          if (units.length >= 2 && units.length <= 6) {
            // small row: try every ordering, keep the strict best
            let bestC = rowCost(d), bestOrd = null;
            const arr = units.slice();
            (function permute(k) {
              if (k === arr.length) {
                unitsByDepth[d] = arr;
                const c = rowCost(d);
                if (c < bestC) { bestC = c; bestOrd = arr.slice(); }
                return;
              }
              for (let i = k; i < arr.length; i++) {
                [arr[k], arr[i]] = [arr[i], arr[k]];
                permute(k + 1);
                [arr[k], arr[i]] = [arr[i], arr[k]];
              }
            })(0);
            unitsByDepth[d] = bestOrd || units;
            if (bestOrd) improved = true;
          } else {
            // big row: sift each unit to its best position
            for (let i = 0; i < units.length; i++) {
              const u = units[i];
              let bestJ = i, bestC = rowCost(d);
              for (let j = 0; j < units.length; j++) {
                if (j === i) continue;
                units.splice(i, 1); units.splice(j, 0, u);
                const c = rowCost(d);
                units.splice(j, 1); units.splice(i, 0, u);
                if (c < bestC) { bestC = c; bestJ = j; }
              }
              if (bestJ !== i) {
                units.splice(i, 1); units.splice(bestJ, 0, u);
                improved = true;
              }
            }
          }
          // plateau walk: cost-neutral neighbour swaps, direction alternating
          // per pass, to escape minima needing coordinated multi-row moves
          if (allowTies) {
            const us = unitsByDepth[d];
            for (let i = dir === 1 ? 0 : us.length - 2;
                 dir === 1 ? i < us.length - 1 : i >= 0; i += dir) {
              const before = rowCost(d);
              [us[i], us[i + 1]] = [us[i + 1], us[i]];
              if (rowCost(d) > before) [us[i], us[i + 1]] = [us[i + 1], us[i]];
            }
          }
        }
        if (!improved && !allowTies) break;
      }

      // Last resort for crossings that need a coordinated change across two
      // rows (each row alone looks locally optimal): exhaustively search
      // adjacent row *pairs* jointly. Gated on crossings remaining, so
      // ordinary trees never pay for it.
      for (let round = 0; round < 3 && totalCost() > 0; round++) {
        let improved = false;
        const permsOf = (arr) => {
          const out = [];
          (function go(k) {
            if (k === arr.length) { out.push(arr.slice()); return; }
            for (let i = k; i < arr.length; i++) {
              [arr[k], arr[i]] = [arr[i], arr[k]];
              go(k + 1);
              [arr[k], arr[i]] = [arr[i], arr[k]];
            }
          })(0);
          return out;
        };
        for (let d = 0; d < maxDepth; d++) {
          const A = unitsByDepth[d], B = unitsByDepth[d + 1];
          if (A.length > 5 || B.length > 5 || A.length * B.length > 20) continue;
          const cost2 = () =>
            (d > 0 ? crossingsBetween(d - 1, d) : 0) +
            crossingsBetween(d, d + 1) +
            (d + 1 < maxDepth ? crossingsBetween(d + 1, d + 2) : 0);
          // couples in each row (flipping who sits left matters too)
          const cplA = A.filter((u) => u.length === 2);
          const cplB = B.filter((u) => u.length === 2);
          const maskMax = (c) => 1 << Math.min(c.length, 3); // cap flip combos
          const applyMask = (cpl, mask) => cpl.forEach((u, b) => { if (mask & (1 << b)) u.reverse(); });
          let bestC = cost2(), best = null;
          for (const a of permsOf(A.slice())) for (const b of permsOf(B.slice())) {
            for (let ma = 0; ma < maskMax(cplA); ma++) for (let mb = 0; mb < maskMax(cplB); mb++) {
              applyMask(cplA, ma); applyMask(cplB, mb);
              unitsByDepth[d] = a; unitsByDepth[d + 1] = b;
              const c = cost2();
              if (c < bestC) { bestC = c; best = { a: a.slice(), b: b.slice(), ma, mb }; }
              applyMask(cplA, ma); applyMask(cplB, mb); // undo flips
            }
          }
          unitsByDepth[d] = best ? best.a : A;
          unitsByDepth[d + 1] = best ? best.b : B;
          if (best) { applyMask(cplA, best.ma); applyMask(cplB, best.mb); improved = true; }
        }
        if (!improved) break;
      }

      // 2d. Order siblings by age where it costs nothing: swap adjacent
      //     units into birth-year order only if the crossing count stays
      //     identical. Cosmetic preference — never trumps a clean layout.
      const ageOf = (u) => {
        const ys = u.map((id) => parseInt(state.people[id].birth, 10)).filter((y) => !isNaN(y));
        return ys.length ? Math.min(...ys) : null;
      };
      for (let pass = 0; pass < 4; pass++) {
        let moved = false;
        for (let d = 0; d <= maxDepth; d++) {
          const units = unitsByDepth[d];
          for (let i = 0; i + 1 < units.length; i++) {
            const a = ageOf(units[i]), b = ageOf(units[i + 1]);
            if (a == null || b == null || a <= b) continue;
            const before = rowCost(d);
            [units[i], units[i + 1]] = [units[i + 1], units[i]];
            if (rowCost(d) > before) [units[i], units[i + 1]] = [units[i + 1], units[i]];
            else moved = true;
          }
        }
        if (!moved) break;
      }
    }

    // Initial pack: left to right per generation.
    for (let d = 0; d <= maxDepth; d++) {
      let cursor = 0;
      unitsByDepth[d].forEach((u) => { unitX.set(unitKey(u), cursor); cursor += unitWidth(u) + H_GAP; });
    }
    const centerOf = (u) => unitX.get(unitKey(u)) + unitWidth(u) / 2;

    // Isotonic (pool-adjacent-violators) fit: nearest non-decreasing sequence.
    function pava(t) {
      const val = [], cnt = [], start = [];
      for (let i = 0; i < t.length; i++) {
        let v = t[i], c = 1, s = i;
        while (val.length && val[val.length - 1] >= v - 1e-9) {
          const pv = val.pop(), pc = cnt.pop(), ps = start.pop();
          v = (v * c + pv * pc) / (c + pc); c += pc; s = ps;
        }
        val.push(v); cnt.push(c); start.push(s);
      }
      const y = new Array(t.length);
      for (let b = 0; b < val.length; b++)
        for (let i = 0; i < cnt[b]; i++) y[start[b] + i] = val[b];
      return y;
    }

    // Place a row's units at their desired lefts while enforcing min spacing,
    // minimizing displacement -> overlapping units center around their mean.
    function compact(units, desiredLeft) {
      const n = units.length;
      if (!n) return;
      const off = []; let acc = 0;
      for (let i = 0; i < n; i++) { off[i] = acc; acc += unitWidth(units[i]) + H_GAP; }
      const t = units.map((u, i) => desiredLeft[i] - off[i]);
      const y = pava(t);
      for (let i = 0; i < n; i++) unitX.set(unitKey(units[i]), y[i] + off[i]);
    }

    const barycenter = (u, rel) => {
      const list = rel.get(unitKey(u));
      if (!list.length) return centerOf(u); // no anchor: stay put
      return list.reduce((s, o) => s + centerOf(o), 0) / list.length;
    };

    for (let it = 0; it < 40; it++) {
      // Down pass: pull each unit under the center of its parents.
      for (let d = 1; d <= maxDepth; d++) {
        const units = unitsByDepth[d];
        compact(units, units.map((u) => barycenter(u, parentUnitsOf) - unitWidth(u) / 2));
      }
      // Up pass: pull each unit over the center of its children.
      for (let d = maxDepth - 1; d >= 0; d--) {
        const units = unitsByDepth[d];
        compact(units, units.map((u) => barycenter(u, childUnitsOf) - unitWidth(u) / 2));
      }
    }

    // Normalize so minimum x is 0
    let minX = Infinity;
    for (let d = 0; d <= maxDepth; d++)
      unitsByDepth[d].forEach((u) => { minX = Math.min(minX, unitX.get(unitKey(u))); });
    if (!isFinite(minX)) minX = 0;

    // 4. Emit positions
    let width = 0;
    for (let d = 0; d <= maxDepth; d++) {
      const y = d * (CARD_H + V_GAP);
      unitsByDepth[d].forEach((u) => {
        let x = unitX.get(unitKey(u)) - minX;
        u.forEach((pid, i) => {
          pos[pid] = { x: x + i * (CARD_W + COUPLE_GAP), y };
          width = Math.max(width, pos[pid].x + CARD_W);
        });
      });
    }
    const height = (maxDepth + 1) * (CARD_H + V_GAP);
    return { pos, width, height };
    } // end layoutComponent
  }

  // ---------- Render ----------
  let layoutCache = null;

  function render() {
    const ppl = people();
    el.empty.style.display = ppl.length ? "none" : "flex";

    const layout = computeLayout();
    layoutCache = layout;

    // nodes
    el.nodes.innerHTML = "";
    ppl.forEach((p) => {
      const pos = layout.pos[p.id];
      if (!pos) return;
      const card = document.createElement("div");
      card.className = "card " + (p.gender === "male" ? "male" : p.gender === "female" ? "female" : "");
      if (p.id === selectedId) card.classList.add("selected");
      card.style.left = pos.x + "px";
      card.style.top = pos.y + "px";
      const dates = formatDates(p);
      const strip = p.gender === "male" ? "var(--male)" : p.gender === "female" ? "var(--female)" : "var(--neutral)";
      const avatar = document.createElement("div");
      avatar.className = "avatar";
      if (p.photo) {
        const img = document.createElement("img");
        img.src = p.photo;
        avatar.appendChild(img);
      } else {
        avatar.style.background = strip;
        avatar.textContent = initials(p.name);
      }
      const text = document.createElement("div");
      text.className = "text";
      text.innerHTML = '<div class="name"></div>' +
        (dates ? '<div class="dates">' + dates + "</div>" : "");
      text.querySelector(".name").textContent = p.name || "Unnamed";
      card.appendChild(avatar);
      card.appendChild(text);
      card.addEventListener("click", (e) => {
        e.stopPropagation();
        if (linkMode) { completeLink(p.id); return; }
        openEditor(p.id);
      });
      el.nodes.appendChild(card);
    });

    drawEdges(layout);
    applyView();
  }

  function initials(name) {
    const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }
  function formatDates(p) {
    // cards show years only; the editor holds the full date of birth
    const by = (p.birth || "").slice(0, 4);
    const dy = (p.death || "").slice(0, 4);
    if (!by && !dy) return "";
    if (by && dy) return by + " – " + dy;
    if (by) return "b. " + by;
    return "d. " + dy;
  }

  // Geometry of every connector as a list of point-sequences (polylines), so
  // the same lines can be drawn to SVG (screen) or a canvas (image export).
  function computeEdges(layout) {
    const segs = [];
    const center = (id) => {
      const p = layout.pos[id];
      return p ? { x: p.x + CARD_W / 2, y: p.y } : null;
    };
    const bottom = (id) => {
      const p = layout.pos[id];
      return p ? { x: p.x + CARD_W / 2, y: p.y + CARD_H } : null;
    };

    // spouse connectors (horizontal)
    const drawnSpouse = new Set();
    people().forEach((p) => {
      p.spouses.forEach((sid) => {
        const key = [p.id, sid].sort().join("-");
        if (drawnSpouse.has(key)) return;
        drawnSpouse.add(key);
        const a = layout.pos[p.id], b = layout.pos[sid];
        if (!a || !b) return;
        if (Math.abs(a.y - b.y) > 1) return; // only same-row couples
        const y = a.y + CARD_H / 2;
        const x1 = Math.min(a.x, b.x) + CARD_W;
        const x2 = Math.max(a.x, b.x);
        segs.push([{ x: x1, y }, { x: x2, y }]);
      });
    });

    // parent -> child connectors. Children of the same parents share one
    // horizontal "bus" line. Each family gets its own lane inside the row
    // gap — wider families take higher lanes — so one family's bus never
    // collides with another family's drop lines (channel routing).
    const fams = new Map(); // parents key -> { ox, oy, kids: [{x,y}] }
    people().forEach((child) => {
      const cs = center(child.id);
      if (!cs) return;
      const vp = child.parents.filter((pid) => layout.pos[pid]);
      if (!vp.length) return;
      const key = vp.slice().sort().join("|");
      let f = fams.get(key);
      if (!f) {
        let ox, oy;
        if (vp.length >= 2) {
          const p1 = bottom(vp[0]), p2 = bottom(vp[1]);
          ox = (p1.x + p2.x) / 2;
          oy = Math.max(p1.y, p2.y) - CARD_H / 2; // couple line height
        } else {
          const b = bottom(vp[0]);
          ox = b.x; oy = b.y;
        }
        f = { ox, oy, kids: [] };
        fams.set(key, f);
      }
      f.kids.push(cs);
    });
    const byRow = new Map(); // child row y -> families feeding it
    fams.forEach((f) => {
      const rowY = Math.min(...f.kids.map((k) => k.y));
      if (!byRow.has(rowY)) byRow.set(rowY, []);
      byRow.get(rowY).push(f);
    });
    byRow.forEach((list, rowY) => {
      const span = (f) => {
        const xs = [f.ox, ...f.kids.map((k) => k.x)];
        return Math.max(...xs) - Math.min(...xs);
      };
      list.sort((a, b) => span(b) - span(a)); // wide first -> higher lane
      const gapTop = rowY - V_GAP;
      list.forEach((f, i) => {
        const midY = gapTop + V_GAP * (i + 1) / (list.length + 1);
        const xs = [f.ox, ...f.kids.map((k) => k.x)];
        const x1 = Math.min(...xs), x2 = Math.max(...xs);
        segs.push([{ x: f.ox, y: f.oy }, { x: f.ox, y: midY }]); // drop from parents
        if (x2 > x1) segs.push([{ x: x1, y: midY }, { x: x2, y: midY }]); // bus
        f.kids.forEach((k) => segs.push([{ x: k.x, y: midY }, { x: k.x, y: k.y }])); // stubs
      });
    });
    return segs;
  }

  function drawEdges(layout) {
    const svg = el.edges;
    svg.setAttribute("width", Math.max(layout.width, 10));
    svg.setAttribute("height", Math.max(layout.height, 10));
    const paths = computeEdges(layout).map((pts) =>
      `<polyline points="${pts.map((p) => p.x + "," + p.y).join(" ")}" ` +
      `fill="none" stroke="var(--line)" stroke-width="2"/>`
    ).join("");
    svg.innerHTML = paths;
  }

  // ---------- View / pan / zoom ----------
  function applyView() {
    el.canvas.style.transform =
      `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  }
  function zoomAt(factor, cx, cy) {
    const ns = Math.min(2.2, Math.max(0.25, view.scale * factor));
    const rect = el.stage.getBoundingClientRect();
    const px = (cx - rect.left - view.x) / view.scale;
    const py = (cy - rect.top - view.y) / view.scale;
    view.scale = ns;
    view.x = cx - rect.left - px * ns;
    view.y = cy - rect.top - py * ns;
    applyView();
  }
  function fit() {
    if (!layoutCache || !people().length) { view.x = 40; view.y = 40; view.scale = 1; applyView(); return; }
    const rect = el.stage.getBoundingClientRect();
    const pad = 60;
    const w = layoutCache.width || 1, h = layoutCache.height || 1;
    const scale = Math.min(1.4, (rect.width - pad * 2) / w, (rect.height - pad * 2) / h);
    view.scale = Math.max(0.25, isFinite(scale) ? scale : 1);
    view.x = (rect.width - w * view.scale) / 2;
    view.y = pad;
    applyView();
  }

  // Pan
  let panning = false, panStart = null;
  el.stage.addEventListener("mousedown", (e) => {
    if (e.target.closest(".card") || e.target.closest("#zoombar")) return;
    panning = true;
    panStart = { x: e.clientX - view.x, y: e.clientY - view.y };
    el.stage.classList.add("panning");
  });
  window.addEventListener("mousemove", (e) => {
    if (!panning) return;
    view.x = e.clientX - panStart.x;
    view.y = e.clientY - panStart.y;
    applyView();
  });
  window.addEventListener("mouseup", () => { panning = false; el.stage.classList.remove("panning"); });
  el.stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.1 : 0.9, e.clientX, e.clientY);
  }, { passive: false });
  el.stage.addEventListener("click", (e) => {
    if (e.target === el.stage || e.target === el.canvas) {
      if (linkMode) cancelLink();
      else closeEditor();
    }
  });

  document.getElementById("zoomIn").onclick = () => { const r = el.stage.getBoundingClientRect(); zoomAt(1.15, r.left + r.width/2, r.top + r.height/2); };
  document.getElementById("zoomOut").onclick = () => { const r = el.stage.getBoundingClientRect(); zoomAt(0.87, r.left + r.width/2, r.top + r.height/2); };
  document.getElementById("zoomReset").onclick = fit;
  document.getElementById("fitBtn").onclick = fit;

  // ---------- Editor ----------
  function openEditor(id) {
    selectedId = id;
    const p = state.people[id];
    if (!p) return;
    el.panelTitle.textContent = "Edit person";
    f.name.value = p.name || "";
    f.birth.value = p.birth || "";
    f.death.value = p.death || "";
    f.gender.value = p.gender || "unknown";
    f.notes.value = p.notes || "";
    updatePhotoPreview(p);
    updateRelHint();
    el.panel.classList.add("open");
    render();
    f.name.focus();
    f.name.select();
  }
  function closeEditor() {
    selectedId = null;
    el.panel.classList.remove("open");
    render();
  }
  function updateRelHint() {
    const p = state.people[selectedId];
    if (!p) { el.relHint.textContent = ""; return; }
    const parents = p.parents.map((id) => nameOf(id)).filter(Boolean);
    const spouses = p.spouses.map((id) => nameOf(id)).filter(Boolean);
    const kids = childrenOf(p.id).map((c) => c.name);
    const parts = [];
    if (parents.length) parts.push("Parents: " + parents.join(", "));
    if (spouses.length) parts.push("Partner: " + spouses.join(", "));
    if (kids.length) parts.push("Children: " + kids.join(", "));
    el.relHint.textContent = parts.length ? parts.join("  ·  ") : "No relationships yet. Use the buttons above to connect this person.";
  }
  function nameOf(id) { return state.people[id] ? (state.people[id].name || "Unnamed") : ""; }

  function readForm() {
    const p = state.people[selectedId];
    if (!p) return;
    p.name = f.name.value.trim() || "Unnamed";
    p.birth = f.birth.value.trim();
    p.death = f.death.value.trim();
    p.gender = f.gender.value;
    p.notes = f.notes.value.trim();
  }

  // ---------- Photo ----------
  function updatePhotoPreview(p) {
    el.photoPreview.innerHTML = "";
    if (p && p.photo) {
      const img = document.createElement("img");
      img.src = p.photo;
      el.photoPreview.appendChild(img);
      el.photoRemove.style.display = "";
    } else {
      el.photoPreview.textContent = initials(p ? p.name : "");
      el.photoRemove.style.display = "none";
    }
  }
  // Downscale to a square thumbnail Blob (JPEG) before upload, so we store a
  // small file in cloud storage rather than the full-resolution original.
  function fileToThumb(file, size, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");
        const s = Math.min(img.width, img.height);
        const sx = (img.width - s) / 2, sy = (img.height - s) / 2;
        ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size); // center-crop square
        canvas.toBlob((blob) => cb(blob), "image/jpeg", 0.82);
      };
      img.onerror = () => cb(null);
      img.src = reader.result;
    };
    reader.onerror = () => cb(null);
    reader.readAsDataURL(file);
  }
  document.getElementById("photoBtn").onclick = () => el.photoInput.click();
  el.photoInput.onchange = (e) => {
    const file = e.target.files[0];
    el.photoInput.value = "";
    if (!file || !selectedId) return;
    const targetId = selectedId;
    const photoBtn = document.getElementById("photoBtn");
    photoBtn.disabled = true; photoBtn.textContent = "Uploading…";
    fileToThumb(file, 256, async (blob) => {
      const done = () => { photoBtn.disabled = false; photoBtn.textContent = "Add photo"; };
      if (!blob) { alert("Sorry, that image couldn't be loaded."); return done(); }
      try {
        const res = await fetch("/api/photo", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
        if (res.status === 401) return redirectToLogin();
        if (!res.ok) throw new Error("upload failed");
        const { url } = await res.json();
        const p = state.people[targetId];
        if (!p) return done();
        p.photo = url;
        save();
        if (selectedId === targetId) updatePhotoPreview(p);
        render();
      } catch (err) {
        alert("Photo upload failed. Please try again.");
      } finally { done(); }
    });
  };
  el.photoRemove.onclick = () => {
    const p = state.people[selectedId];
    if (!p) return;
    delete p.photo;
    save();
    updatePhotoPreview(p);
    render();
  };

  document.getElementById("saveBtn").onclick = () => { readForm(); save(); render(); flashPanel(); };
  document.getElementById("panelClose").onclick = () => { readForm(); save(); closeEditor(); };
  document.getElementById("deleteBtn").onclick = () => {
    const p = state.people[selectedId];
    if (!p) return;
    if (confirm(`Delete “${p.name}”? This removes them from the tree.`)) {
      removePerson(selectedId);
      save();
      closeEditor();
    }
  };
  // Auto-save edits to fields on the fly
  [f.name, f.birth, f.death, f.gender, f.notes].forEach((inp) =>
    inp.addEventListener("change", () => { readForm(); save(); render(); }));

  function flashPanel() {
    el.panel.animate(
      [{ boxShadow: "-2px 0 0 3px var(--accent)" }, { boxShadow: "-2px 0 12px rgba(60,50,30,0.12)" }],
      { duration: 500 }
    );
  }

  // ---------- Relationship building ----------
  document.getElementById("relParent").onclick = () => startLink("parent");
  document.getElementById("relChild").onclick = () => startLink("child");
  document.getElementById("relSpouse").onclick = () => startLink("spouse");
  document.getElementById("relLink").onclick = () => startLink("link");

  function startLink(type) {
    readForm();
    const src = selectedId;
    if (!src) return;

    if (type === "link") {
      linkMode = { type: "link", sourceId: src };
      el.relHint.textContent = "Click another card to link. Then you'll choose how they're related. (Click empty space to cancel.)";
      el.panel.classList.remove("open");
      return;
    }
    // create a fresh relative immediately
    const np = newPerson({ name: "New " + type });
    applyRelation(type, src, np.id);
    save();
    openEditor(np.id);
  }

  function applyRelation(type, srcId, otherId) {
    if (type === "parent") addParentRelation(srcId, otherId);
    else if (type === "child") addParentRelation(otherId, srcId);
    else if (type === "spouse") linkSpouses(srcId, otherId);
  }

  function completeLink(targetId) {
    const src = linkMode.sourceId;
    linkMode = null;
    el.panel.classList.add("open");
    if (targetId === src) { updateRelHint(); return; }
    const rel = prompt(
      `How is “${nameOf(targetId)}” related to “${nameOf(src)}”?\n` +
      "Type:  parent  /  child  /  partner", "parent");
    if (!rel) { updateRelHint(); return; }
    const r = rel.trim().toLowerCase();
    if (r.startsWith("parent")) applyRelation("parent", src, targetId);
    else if (r.startsWith("child")) applyRelation("child", src, targetId);
    else if (r.startsWith("partner") || r.startsWith("spouse")) applyRelation("spouse", src, targetId);
    save();
    openEditor(src);
  }
  function cancelLink() { linkMode = null; el.panel.classList.add("open"); updateRelHint(); }

  // ---------- Toolbar ----------
  document.getElementById("addBtn").onclick = () => {
    const p = newPerson({ name: "New person" });
    save();
    openEditor(p.id);
    setTimeout(fit, 0);
  };
  document.getElementById("clearBtn").onclick = () => {
    if (!people().length || confirm("Clear the entire tree? This cannot be undone.")) {
      state = { people: {}, nextId: 1 };
      selectedId = null;
      save();
      closeEditor();
    }
  };
  document.getElementById("exportBtn").onclick = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "family-tree.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  // Render the whole tree to a PNG by redrawing it onto a canvas (keeps the
  // export self-contained — no external libraries).
  function exportImage() {
    const ppl = people();
    if (!ppl.length) { alert("Add some people first, then export."); return; }
    const layout = computeLayout();
    const PAD = 48;
    const SCALE = 2; // retina-crisp output
    const w = Math.max(layout.width, CARD_W) + PAD * 2;
    const h = Math.max(layout.height - V_GAP, CARD_H) + PAD * 2;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * SCALE);
    canvas.height = Math.round(h * SCALE);
    const ctx = canvas.getContext("2d");
    ctx.scale(SCALE, SCALE);

    // theme colors (match the CSS)
    const C = { bg: "#f4f1ea", line: "#b9a98f", card: "#ffffff", border: "#e0d8c7",
      ink: "#2b2b2b", muted: "#7a7266", male: "#6a8caf", female: "#b56576", neutral: "#8a8577" };

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, w, h);
    ctx.translate(PAD, PAD);

    // edges
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    computeEdges(layout).forEach((pts) => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    });

    // rounded-rect helper
    const rr = (x, y, ww, hh, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + ww, y, x + ww, y + hh, r);
      ctx.arcTo(x + ww, y + hh, x, y + hh, r);
      ctx.arcTo(x, y + hh, x, y, r);
      ctx.arcTo(x, y, x + ww, y, r);
      ctx.closePath();
    };

    const AV = 48, avPad = 12, gap = 10, textX = avPad + AV + gap;
    const drawCard = (p, photoImg) => {
      const pos = layout.pos[p.id];
      if (!pos) return;
      const x = pos.x, y = pos.y;
      const strip = p.gender === "male" ? C.male : p.gender === "female" ? C.female : C.neutral;
      // shadow + body
      ctx.save();
      ctx.shadowColor = "rgba(60,50,30,0.18)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = C.card;
      rr(x, y, CARD_W, CARD_H, 10);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = C.border;
      ctx.lineWidth = 1;
      rr(x, y, CARD_W, CARD_H, 10);
      ctx.stroke();
      // top color strip (clipped to the rounded top)
      ctx.save();
      rr(x, y, CARD_W, CARD_H, 10);
      ctx.clip();
      ctx.fillStyle = strip;
      ctx.fillRect(x, y, CARD_W, 4);
      ctx.restore();

      // avatar: photo (center-cropped circle) or initials on a tinted disc
      const cx = x + avPad + AV / 2, cy = y + CARD_H / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, AV / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      if (photoImg) {
        ctx.drawImage(photoImg, x + avPad, cy - AV / 2, AV, AV);
      } else {
        ctx.fillStyle = strip;
        ctx.fillRect(x + avPad, cy - AV / 2, AV, AV);
        ctx.fillStyle = "#fff";
        ctx.font = "650 17px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(initials(p.name), cx, cy + 1);
      }
      ctx.restore();
      ctx.textAlign = "left";

      // name (wrapped, up to 2 lines) + dates
      const tw = CARD_W - textX - avPad;
      ctx.textBaseline = "top";
      ctx.fillStyle = C.ink;
      ctx.font = "600 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
      const lines = wrapText(ctx, p.name || "Unnamed", tw, 2);
      const dates = formatDates(p);
      const blockH = lines.length * 17 + (dates ? 17 : 0);
      let ty = y + (CARD_H - blockH) / 2;
      lines.forEach((ln) => { ctx.fillText(ln, x + textX, ty); ty += 17; });
      if (dates) {
        ctx.fillStyle = C.muted;
        ctx.font = "11.5px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillText(dates, x + textX, ty + 2);
      }
    };

    // Preload photos, then draw every card, then export.
    const withPhotos = ppl.filter((p) => p.photo);
    let pending = withPhotos.length;
    const imgs = new Map();
    const finish = () => {
      ppl.forEach((p) => drawCard(p, imgs.get(p.id)));
      canvas.toBlob((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "family-tree.png";
        a.click();
        URL.revokeObjectURL(a.href);
      }, "image/png");
    };
    if (!pending) return finish();
    withPhotos.forEach((p) => {
      const img = new Image();
      img.crossOrigin = "anonymous"; // Blob URLs are cross-origin; avoid tainting the canvas
      img.onload = () => { imgs.set(p.id, img); if (--pending === 0) finish(); };
      img.onerror = () => { if (--pending === 0) finish(); };
      img.src = p.photo;
    });
  }

  function wrapText(ctx, text, maxW, maxLines) {
    const words = String(text).split(/\s+/).filter(Boolean);
    if (!words.length) return [""];
    const lines = [];
    let cur = words[0];
    for (let i = 1; i < words.length; i++) {
      if (ctx.measureText(cur + " " + words[i]).width > maxW) {
        lines.push(cur);
        if (lines.length === maxLines - 1) { cur = words.slice(i).join(" "); break; }
        cur = words[i];
      } else {
        cur += " " + words[i];
      }
    }
    lines.push(cur);
    // ellipsize any line that still overflows (e.g. the aggregated last line)
    return lines.map((s) => {
      while (ctx.measureText(s).width > maxW && s.length > 1) s = s.slice(0, -2) + "…";
      return s;
    });
  }

  document.getElementById("exportImgBtn").onclick = exportImage;
  document.getElementById("importBtn").onclick = () => el.fileInput.click();
  el.fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data && data.people) {
          state = data;
          if (!state.nextId) state.nextId = people().length + 1;
          selectedId = null;
          save(); closeEditor(); fit();
        } else alert("That file doesn't look like a family tree export.");
      } catch (err) { alert("Could not read file: " + err.message); }
    };
    reader.readAsText(file);
    el.fileInput.value = "";
  };

  // ---------- Sample data ----------
  document.getElementById("sampleBtn").onclick = () => {
    if (people().length && !confirm("Replace the current tree with the sample?")) return;
    state = buildSample();
    selectedId = null;
    save(); closeEditor(); fit();
  };

  function buildSample() {
    const s = { people: {}, nextId: 1 };
    state = s; // so uid()/newPerson operate on it
    const mk = (name, gender, birth, death) => newPerson({ name, gender, birth: birth || "", death: death || "" }).id;
    const wed = linkSpouses;
    const kidOf = (child, parent) => addParentRelation(child, parent);

    // Generation 1
    const venkat = mk("Venkata Rao Chirumamilla", "male", "1938-02-11", "2016");
    const savitri = mk("Savitri Chirumamilla", "female", "1943-07-02");
    wed(venkat, savitri);

    // Generation 2 — four children, all married
    const ranga = mk("Ranga Rao Chirumamilla", "male", "1962-01-15");
    const lakshmi = mk("Lakshmi Vemuri", "female", "1964-05-28");
    const suresh = mk("Suresh Chirumamilla", "male", "1968-09-03");
    const kavitha = mk("Kavitha Kancherla", "female", "1971-12-19");
    [ranga, lakshmi, suresh, kavitha].forEach((c) => kidOf(c, venkat));
    const sreedevi = mk("Sreedevi Chirumamilla", "female", "1966-03-08");
    wed(ranga, sreedevi);
    const prasad = mk("Prasad Vemuri", "male", "1960-11-22");
    wed(lakshmi, prasad);
    const padma = mk("Padma Chirumamilla", "female", "1972-04-14");
    wed(suresh, padma);
    const ravi = mk("Ravi Teja Kancherla", "male", "1969-08-30");
    wed(kavitha, ravi);

    // Generation 3
    const krishna = mk("Krishna Vamsi Chirumamilla", "male", "1995-06-18");
    const divya = mk("Divya Chirumamilla", "female", "1998-10-05");
    kidOf(krishna, ranga); kidOf(divya, ranga);
    const leela = mk("Leela Satyavathi Pentakota", "female", "1996-02-27");
    wed(krishna, leela);

    const anand = mk("Anand Vemuri", "male", "1988-03-12");
    const meghana = mk("Meghana Gudivada", "female", "1992-07-25");
    const tejaswi = mk("Tejaswi Vemuri", "female", "1994-12-01");
    [anand, meghana, tejaswi].forEach((c) => kidOf(c, lakshmi));
    const swathi = mk("Swathi Vemuri", "female", "1990-09-17");
    wed(anand, swathi);
    const karthik = mk("Karthik Gudivada", "male", "1989-05-09");
    wed(meghana, karthik);

    const nikhil = mk("Nikhil Chirumamilla", "male", "1996-11-11");
    const harsha = mk("Harsha Chirumamilla", "male", "1999-04-23");
    kidOf(nikhil, suresh); kidOf(harsha, suresh);
    const ananya = mk("Ananya Chirumamilla", "female", "1998-08-14");
    wed(nikhil, ananya);

    const aditya = mk("Aditya Kancherla", "male", "1993-01-30");
    const sruthi = mk("Sruthi Kancherla", "female", "1997-06-06");
    kidOf(aditya, kavitha); kidOf(sruthi, kavitha);
    const ramya = mk("Ramya Kancherla", "female", "1995-10-21");
    wed(aditya, ramya);

    // Leela's parents (in-laws)
    const haranadh = mk("Haranadh Pentakota", "male", "1969-01-05");
    const padmavathi = mk("Padmavathi Pentakota", "female", "1974-03-16");
    kidOf(leela, haranadh); kidOf(leela, padmavathi);

    // Generation 4
    const ishaan = mk("Ishaan Chirumamilla", "male", "2024-09-02");
    kidOf(ishaan, krishna);
    const advik = mk("Advik Vemuri", "male", "2016-05-19");
    const anika = mk("Anika Vemuri", "female", "2019-02-08");
    kidOf(advik, anand); kidOf(anika, anand);
    const vihaan = mk("Vihaan Gudivada", "male", "2018-12-25");
    kidOf(vihaan, meghana);
    const saanvi = mk("Saanvi Kancherla", "female", "2021-07-07");
    kidOf(saanvi, aditya);
    const arjun = mk("Arjun Chirumamilla", "male", "2023-03-11");
    kidOf(arjun, nikhil);

    return s;
  }

  // ---------- Keyboard ----------
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (linkMode) cancelLink(); else closeEditor(); }
    if (e.key === "Enter" && (e.target === f.name)) document.getElementById("saveBtn").click();
  });

  // ---------- Logout ----------
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.onclick = async () => {
    await flushSave();
    await fetch("/api/auth/logout", { method: "POST" });
    redirectToLogin();
  };

  // ---------- Init ----------
  loadFromServer().then(() => {
    render();
    fit();
    setSaveStatus("saved");
  });
})();
