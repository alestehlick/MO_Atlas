let viewer = null;
let currentManifest = null;
let currentDeckId = null;
let currentOrbitalIndex = 0;
let currentXYZ = "";

const POSITIVE_COLOR = "#5da7ff";
const NEGATIVE_COLOR = "#ff6b8a";
const AXIS_COLOR = "#e6c46a";
const PLANE_COLOR = "#b892ff";

const deckSelect = document.getElementById("deck-select");
const loadButton = document.getElementById("load-button");
const orbitalSelect = document.getElementById("orbital-select");
const orbitalInfo = document.getElementById("orbital-info");
const moleculeName = document.getElementById("molecule-name");
const moleculeMeta = document.getElementById("molecule-meta");

const isoSlider = document.getElementById("iso-slider");
const isoValueLabel = document.getElementById("iso-value-label");

const showOrbital = document.getElementById("show-orbital");
const showSymmetry = document.getElementById("show-symmetry");
const showAxes = document.getElementById("show-axes");
const showPlanes = document.getElementById("show-planes");
const showLabels = document.getElementById("show-labels");

function vec(x, y, z) {
  return { x, y, z };
}

function normalize(v) {
  const n = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (n === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / n, y: v.y / n, z: v.z / n };
}

function scale(v, s) {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function add(a, b) {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function arrToVec(a) {
  return { x: a[0], y: a[1], z: a[2] };
}

function initViewer() {
  viewer = $3Dmol.createViewer("viewer", {
    backgroundColor: "#05070d"
  });
}

async function loadDeckIndex() {
  const response = await fetch("decks/index.json");
  const index = await response.json();

  deckSelect.innerHTML = "";

  for (const deck of index.decks) {
    const opt = document.createElement("option");
    opt.value = deck.id;
    opt.textContent = `${deck.name} (${deck.formula})`;
    deckSelect.appendChild(opt);
  }
}

async function loadDeck(deckId) {
  currentDeckId = deckId;

  const manifestResponse = await fetch(`decks/${deckId}/manifest.json`);
  currentManifest = await manifestResponse.json();

  const xyzResponse = await fetch(`decks/${deckId}/${currentManifest.molecule_xyz}`);
  currentXYZ = await xyzResponse.text();

  moleculeName.textContent = `${currentManifest.name} — ${currentManifest.formula}`;

  moleculeMeta.innerHTML = `
    point group: ${currentManifest.symmetry?.point_group || "—"}<br>
    method: ${currentManifest.method} / ${currentManifest.basis}<br>
    HOMO: MO ${currentManifest.homo_orca_number}<br>
    LUMO: MO ${currentManifest.lumo_orca_number}
  `;

  fillOrbitalSelect();

  const homo = currentManifest.homo_orca_number;
  const homoIndex = currentManifest.orbitals.findIndex(o => o.orca_number === homo);
  currentOrbitalIndex = homoIndex >= 0 ? homoIndex : 0;
  orbitalSelect.value = String(currentOrbitalIndex);

  await renderScene();
}

function fillOrbitalSelect() {
  orbitalSelect.innerHTML = "";

  for (let i = 0; i < currentManifest.orbitals.length; i++) {
    const orb = currentManifest.orbitals[i];

    const roleText =
      orb.role === "HOMO" || orb.role === "LUMO"
        ? ` — ${orb.role}`
        : "";

    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = `${orb.label}${roleText} — occ. ${orb.occupation}`;
    orbitalSelect.appendChild(opt);
  }
}

function drawMolecule() {
  viewer.addModel(currentXYZ, "xyz");

  viewer.setStyle({}, {
    stick: {
      radius: 0.075,
      colorscheme: "Jmol"
    },
    sphere: {
      scale: 0.24,
      colorscheme: "Jmol"
    }
  });
}

async function drawOrbital() {
  const orbital = currentManifest.orbitals[currentOrbitalIndex];

  orbitalInfo.innerHTML = `
    ${orbital.label} — ${orbital.role}<br>
    occupation: ${orbital.occupation}<br>
    energy: ${orbital.energy_hartree.toFixed(6)} Hartree
    / ${orbital.energy_ev.toFixed(3)} eV
  `;

  if (!showOrbital.checked) {
    return;
  }

  const iso = parseFloat(isoSlider.value);
  isoValueLabel.textContent = iso.toFixed(3);

  const cubePath = `decks/${currentDeckId}/${orbital.cube}`;

  const response = await fetch(cubePath);
  const cubeText = await response.text();

  const voldata = new $3Dmol.VolumeData(cubeText, "cube");

  viewer.addIsosurface(voldata, {
    isoval: iso,
    color: POSITIVE_COLOR,
    opacity: 0.64,
    smoothness: 10
  });

  viewer.addIsosurface(voldata, {
    isoval: -iso,
    color: NEGATIVE_COLOR,
    opacity: 0.64,
    smoothness: 10
  });
}

function drawAxis(element) {
  const d = normalize(arrToVec(element.direction));
  const length = element.order === 3 ? 2.35 : 2.15;
  const start = scale(d, -length);
  const end = scale(d, length);

  viewer.addCylinder({
    start,
    end,
    radius: element.order === 3 ? 0.018 : 0.014,
    color: AXIS_COLOR,
    opacity: 0.74,
    fromCap: true,
    toCap: true
  });

  if (showLabels.checked) {
    viewer.addLabel(element.label, {
      position: scale(d, length + 0.22),
      fontColor: AXIS_COLOR,
      backgroundColor: "rgba(5,7,13,0.72)",
      fontSize: 12,
      borderThickness: 0
    });
  }
}

function drawPlane(element) {
  const n = normalize(arrToVec(element.normal));

  let helper = vec(0, 0, 1);
  if (Math.abs(dot(n, helper)) > 0.92) {
    helper = vec(0, 1, 0);
  }

  const u = normalize(cross(n, helper));
  const v = normalize(cross(n, u));

  const size = 2.35;
  const p1 = add(scale(u, size), scale(v, size));
  const p2 = add(scale(u, -size), scale(v, size));
  const p3 = add(scale(u, -size), scale(v, -size));
  const p4 = add(scale(u, size), scale(v, -size));

  const shape = viewer.addShape({
    color: PLANE_COLOR,
    alpha: 0.16
  });

  shape.addCustom({
    vertexArr: [p1, p2, p3, p4],
    faceArr: [
      [0, 1, 2],
      [0, 2, 3]
    ],
    normalArr: [n, n, n, n]
  });

  const edges = [
    [p1, p2],
    [p2, p3],
    [p3, p4],
    [p4, p1]
  ];

  for (const [a, b] of edges) {
    viewer.addCylinder({
      start: a,
      end: b,
      radius: 0.006,
      color: PLANE_COLOR,
      opacity: 0.38
    });
  }

  if (showLabels.checked) {
    const labelPos = add(scale(u, size * 0.82), scale(v, size * 0.82));
    viewer.addLabel(element.label, {
      position: labelPos,
      fontColor: PLANE_COLOR,
      backgroundColor: "rgba(5,7,13,0.72)",
      fontSize: 12,
      borderThickness: 0
    });
  }
}

function drawSymmetryElements() {
  if (!showSymmetry.checked) return;

  const elements = currentManifest.symmetry?.elements || [];

  for (const element of elements) {
    if (element.type === "axis" && showAxes.checked) {
      drawAxis(element);
    }

    if (element.type === "plane" && showPlanes.checked) {
      drawPlane(element);
    }
  }

  viewer.addSphere({
    center: { x: 0, y: 0, z: 0 },
    radius: 0.045,
    color: "#f5ddb0",
    opacity: 0.8
  });
}

async function renderScene() {
  viewer.clear();

  drawMolecule();
  await drawOrbital();
  drawSymmetryElements();

  viewer.zoomTo();
  viewer.render();
}

loadButton.addEventListener("click", async () => {
  await loadDeck(deckSelect.value);
});

orbitalSelect.addEventListener("change", async () => {
  currentOrbitalIndex = parseInt(orbitalSelect.value, 10);
  await renderScene();
});

isoSlider.addEventListener("input", async () => {
  await renderScene();
});

for (const el of [showOrbital, showSymmetry, showAxes, showPlanes, showLabels]) {
  el.addEventListener("change", async () => {
    await renderScene();
  });
}

async function main() {
  initViewer();
  await loadDeckIndex();

  if (deckSelect.options.length > 0) {
    await loadDeck(deckSelect.value);
  }
}

main();