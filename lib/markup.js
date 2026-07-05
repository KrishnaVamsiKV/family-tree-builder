export const MARKUP = `
<header>
  <span class="logo">🌳</span>
  <h1>Family Tree Builder</h1>
  <div class="spacer"></div>
  <span id="saveStatus" class="save-status"></span>
  <button id="fitBtn" class="ghost">Fit</button>
  <button id="exportImgBtn" class="ghost">Export image</button>
  <button id="exportBtn" class="ghost">Export JSON</button>
  <button id="importBtn" class="ghost">Import</button>
  <button id="sampleBtn" class="ghost">Load sample</button>
  <button id="clearBtn" class="ghost danger">Clear</button>
  <input id="fileInput" type="file" accept="application/json" class="filehint" />
  <button id="logoutBtn" class="ghost">Log out</button>
</header>

<div id="stage">
  <div id="canvas">
    <svg class="edges" id="edges"></svg>
    <div id="nodes"></div>
  </div>
  <div id="empty">
    <div style="font-size:44px">🌳</div>
    <div style="font-size:16px;color:var(--ink)">Start your family tree</div>
    <div>Add the first person, or load the sample tree to explore.</div>
    <div style="display:flex;gap:10px">
      <button class="primary" id="addFirstBtn">+ Add first person</button>
      <button onclick="document.getElementById('sampleBtn').click()">Load sample</button>
    </div>
  </div>
  <div id="zoombar">
    <button id="zoomOut">−</button>
    <button id="zoomIn">+</button>
    <button id="zoomReset">⤢</button>
  </div>
</div>

<div id="panel">
  <div class="phead">
    <h2 id="panelTitle">Edit person</h2>
    <button class="ghost" id="panelClose">✕</button>
  </div>
  <div class="pbody">
    <div class="photo-row">
      <div id="photoPreview" class="avatar-lg">?</div>
      <div class="photo-actions">
        <button id="photoBtn">Add photo</button>
        <button id="photoRemove" class="ghost" style="display:none">Remove</button>
        <input id="photoInput" type="file" accept="image/*" style="display:none" />
      </div>
    </div>

    <label for="fName">Name</label>
    <input id="fName" placeholder="Full name" />

    <div class="row2">
      <div>
        <label for="fBirth">Date of birth</label>
        <input id="fBirth" type="date" />
      </div>
      <div>
        <label for="fDeath">Died (year)</label>
        <input id="fDeath" placeholder="—" />
      </div>
    </div>

    <label for="fGender">Gender</label>
    <select id="fGender">
      <option value="unknown">Unspecified</option>
      <option value="male">Male</option>
      <option value="female">Female</option>
    </select>

    <label for="fNotes">Notes</label>
    <textarea id="fNotes" placeholder="Occupation, birthplace, anecdotes…"></textarea>

    <hr class="divider" />

    <label>Relationships</label>
    <div class="hint" id="relHint"></div>

    <div class="panel-actions">
      <button class="primary" id="saveBtn">Save</button>
      <button class="danger" id="deleteBtn">Delete</button>
    </div>
  </div>
</div>
`;
