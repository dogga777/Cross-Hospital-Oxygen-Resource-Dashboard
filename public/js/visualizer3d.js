// 🌟 Pristine Apple-Clinical Spatial 3D Engine & Digital Twin 🌟
// Powered by Three.js (Hardware-Accelerated WebGL)
// Aesthetic: Studio-Lit Medical Spatial Computing, Frosted Glass, Metallic Chrome, and Cinematic Physics

(function() {
  'use strict';

  if (typeof THREE === 'undefined') {
    setTimeout(initWhenThreeReady, 100);
    return;
  }
  initWhenThreeReady();

  function initWhenThreeReady() {
    if (typeof THREE === 'undefined') {
      setTimeout(initWhenThreeReady, 150);
      return;
    }
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      init3D();
    } else {
      window.addEventListener('DOMContentLoaded', init3D);
    }
  }

  // Core Three.js Variables
  let scene, camera, renderer;
  let canvas, container;
  let activeMode = 'GRID'; // 'GRID', 'CYLINDER', 'ORBIT'
  let isAutoRotate = true;
  let cinematicOrbitSpeed = 0.0025;

  // Cinematic Smooth Damping System
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  let targetRotation = { x: 0.58, y: -0.55 };
  let currentRotation = { x: 0.58, y: -0.55 };
  let targetDistance = 34;
  let currentDistance = 34;
  let targetLookAt = new THREE.Vector3(0, 1.2, 0);
  let currentLookAt = new THREE.Vector3(0, 1.2, 0);

  // Interaction Raycasting
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2(-999, -999);
  let hoveredNode = null;

  // Scene Hierarchies
  let districtGroup, cylinderGroup;
  let hospitalNodes = {};
  let transferCorridors = [];
  let ambulanceVehicle = null;
  let ambulanceCurve = null;
  let ambulanceProgress = 0;
  let internalGasParticles = null;
  let ventGasParticles = null;
  let gaugeNeedle = null;
  let hudOverlayContainer = null;
  let studioPodium = null;

  // District 04 Hospital Spatial Node Coordinates (Balanced Radial Grid)
  const HOSPITAL_COORDS_3D = {
    'HOSP-01': { x: -8.8, z: 4.2, name: 'Hospital A (Metro General)', letter: 'A', area: 'Downtown' },
    'HOSP-02': { x: 7.9, z: -4.8, name: 'Hospital B (St. Jude)', letter: 'B', area: 'Uptown' },
    'HOSP-03': { x: -7.0, z: -6.9, name: 'Hospital C (Riverbank)', letter: 'C', area: 'Westside' },
    'HOSP-04': { x: 9.4, z: 5.2, name: 'Hospital D (Oak Valley)', letter: 'D', area: 'Harbor' },
    'HOSP-05': { x: -0.4, z: -9.8, name: 'Hospital E (Mercy Urban)', letter: 'E', area: 'Heights' },
    'HOSP-06': { x: 0.6, z: 9.6, name: 'Hospital F (Highland)', letter: 'F', area: 'Foothills' }
  };

  function init3D() {
    container = document.getElementById('viewport3DContainer');
    canvas = document.getElementById('canvas3dCommand');
    if (!container || !canvas || scene) return;

    hudOverlayContainer = document.getElementById('viewport3dLabels');

    // 1. Scene with Pristine Studio Lighting Fog
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc); // Clean clinical titanium white
    scene.fog = new THREE.FogExp2(0xf8fafc, 0.012);

    // 2. Camera Setup
    const aspect = container.clientWidth / (container.clientHeight || 460);
    camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 1000);
    updateCameraMath();

    // 3. WebGL Renderer with Studio Antialiasing & Soft Shadows
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    renderer.setSize(container.clientWidth, container.clientHeight || 460);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    // 4. Studio Lighting System (High-Key Apple Studio Light)
    setupStudioLighting();

    // 5. Scene Groups
    districtGroup = new THREE.Group();
    cylinderGroup = new THREE.Group();
    scene.add(districtGroup);
    scene.add(cylinderGroup);

    // 6. Build High-Precision 3D Models
    buildStudioStage();
    buildHospitalPavilions();
    buildCylinderDigitalTwin();

    // Set initial mode
    setVisualizerMode('GRID');

    // 7. Event Handlers & Gestures
    setupInteractionControls();
    setupResizeListener();

    // 8. Connect to Live Telemetry
    connectWithAppState();

    // 9. Card 3D Tilt Parallax on DOM
    initCard3DTilt();

    // 10. Start 60 FPS Render Loop
    animate();

    console.log('[3D Engine] Pristine Apple-Clinical Spatial Studio initialized.');
  }

  // ==========================================
  // Studio 3-Point Lighting Setup
  // ==========================================
  function setupStudioLighting() {
    // 1. Soft Ambient Sky Light
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 0.95);
    scene.add(hemiLight);

    // 2. Main Key Directional Light (Casting Soft Shadows)
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(22, 36, 18);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 10;
    keyLight.shadow.camera.far = 100;
    keyLight.shadow.camera.left = -25;
    keyLight.shadow.camera.right = 25;
    keyLight.shadow.camera.top = 25;
    keyLight.shadow.camera.bottom = -25;
    keyLight.shadow.bias = -0.0005;
    scene.add(keyLight);

    // 3. Cool Clinical Fill Light
    const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.7);
    fillLight.position.set(-20, 18, -15);
    scene.add(fillLight);

    // 4. Specular Chrome Rim Light
    const rimLight = new THREE.DirectionalLight(0xecfdf5, 0.6);
    rimLight.position.set(0, -10, -25);
    scene.add(rimLight);
  }

  // ==========================================
  // Reflective Studio Podium & Precision Rings
  // ==========================================
  function buildStudioStage() {
    // 1. Soft Reflective Ground Plane
    const groundGeo = new THREE.PlaneGeometry(160, 160);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.45,
      metalness: 0.05
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.05;
    ground.receiveShadow = true;
    scene.add(ground);

    // 2. Floating Circular Studio Podium
    const podiumGeo = new THREE.CylinderGeometry(20, 20.4, 0.4, 64);
    const podiumMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.15,
      metalness: 0.1,
      clearcoat: 0.8,
      clearcoatRoughness: 0.15
    });
    studioPodium = new THREE.Mesh(podiumGeo, podiumMat);
    studioPodium.position.y = -0.2;
    studioPodium.receiveShadow = true;
    districtGroup.add(studioPodium);

    // 3. Precision Laser Calibration Grid on Podium
    [7, 13, 19].forEach((radius, i) => {
      const ringGeo = new THREE.RingGeometry(radius - 0.04, radius + 0.04, 96);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x0d9488, // Clinical surgical teal
        transparent: true,
        opacity: 0.22 - i * 0.05,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.02;
      districtGroup.add(ring);
    });

    // Outer Chrome Ring
    const chromeRingGeo = new THREE.TorusGeometry(19.9, 0.06, 16, 100);
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      metalness: 0.95,
      roughness: 0.1
    });
    const chromeRing = new THREE.Mesh(chromeRingGeo, chromeMat);
    chromeRing.rotation.x = Math.PI / 2;
    chromeRing.position.y = 0.02;
    districtGroup.add(chromeRing);
  }

  // ==========================================
  // Modern Architectural Hospital Pavilions
  // ==========================================
  function buildHospitalPavilions() {
    Object.keys(HOSPITAL_COORDS_3D).forEach(id => {
      const data = HOSPITAL_COORDS_3D[id];
      const nodeGroup = new THREE.Group();
      nodeGroup.position.set(data.x, 0, data.z);
      nodeGroup.userData = { hospitalId: id, name: data.name, letter: data.letter, area: data.area };

      // 1. Titanium Foundation Disc
      const discGeo = new THREE.CylinderGeometry(2.2, 2.3, 0.25, 36);
      const discMat = new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        metalness: 0.85,
        roughness: 0.2
      });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.position.y = 0.125;
      disc.receiveShadow = true;
      nodeGroup.add(disc);

      // 2. Chrome Rim Accent
      const rimGeo = new THREE.TorusGeometry(2.28, 0.04, 16, 36);
      const rimMat = new THREE.MeshStandardMaterial({ color: 0x0d9488, metalness: 0.9, roughness: 0.1 });
      const rim = new THREE.Mesh(rimGeo, rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.26;
      nodeGroup.add(rim);

      // 3. Pavilion Main Tower (Frosted Glass & Ceramic White)
      const towerHeight = 3.8;
      const towerGeo = new THREE.CylinderGeometry(1.0, 1.25, towerHeight, 16);
      const towerMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: 0.2,
        roughness: 0.1,
        transparent: true,
        opacity: 0.92
      });
      const tower = new THREE.Mesh(towerGeo, towerMat);
      tower.position.y = towerHeight / 2 + 0.25;
      tower.castShadow = true;
      tower.receiveShadow = true;
      nodeGroup.add(tower);

      // 4. Clinical Status Glowing Beacon Collar
      const collarGeo = new THREE.CylinderGeometry(1.05, 1.05, 0.45, 16);
      const collarMat = new THREE.MeshBasicMaterial({ color: 0x0d9488 });
      const collar = new THREE.Mesh(collarGeo, collarMat);
      collar.position.y = towerHeight + 0.25;
      nodeGroup.add(collar);

      // 5. Floating Cross Glyph on Roof
      const crossGroup = new THREE.Group();
      const crossMat = new THREE.MeshBasicMaterial({ color: 0x059669 });
      const barH = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.22, 0.12), crossMat);
      const barV = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.75, 0.12), crossMat);
      crossGroup.add(barH);
      crossGroup.add(barV);
      crossGroup.position.y = towerHeight + 0.95;
      nodeGroup.add(crossGroup);

      // 6. Expanding Radar Wave Ring
      const pulseGeo = new THREE.RingGeometry(0.4, 0.6, 32);
      const pulseMat = new THREE.MeshBasicMaterial({
        color: 0x0d9488,
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide
      });
      const pulseRing = new THREE.Mesh(pulseGeo, pulseMat);
      pulseRing.rotation.x = Math.PI / 2;
      pulseRing.position.y = 0.02;
      nodeGroup.add(pulseRing);

      // Save references
      hospitalNodes[id] = {
        group: nodeGroup,
        tower: tower,
        collar: collar,
        cross: crossGroup,
        crossMat: crossMat,
        pulseRing: pulseRing,
        currentStock: 100,
        height: towerHeight
      };

      districtGroup.add(nodeGroup);
    });

    // Build Modern Autonomous Medical Transport Pod
    buildMedicalAmbulancePod();
  }

  // ==========================================
  // Modern Aerodynamic Medical Shuttle Pod
  // ==========================================
  function buildMedicalAmbulancePod() {
    ambulanceVehicle = new THREE.Group();

    // Streamlined Ceramic Pod Hull
    const hullGeo = new THREE.CylinderGeometry(0.42, 0.5, 1.8, 16);
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.3,
      roughness: 0.15,
      clearcoat: 0.6
    });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.rotation.x = Math.PI / 2;
    hull.position.y = 0.45;
    hull.castShadow = true;
    ambulanceVehicle.add(hull);

    // Front Tinted Glass Canopy
    const noseGeo = new THREE.SphereGeometry(0.42, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const noseMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.1 });
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0.45, 0.9);
    ambulanceVehicle.add(nose);

    // Medical Red Emergency Halo
    const haloGeo = new THREE.TorusGeometry(0.38, 0.04, 8, 24);
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xe11d48 });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.position.set(0, 0.72, 0);
    ambulanceVehicle.add(halo);

    // Twin Rear Ion Gliders
    [-0.32, 0.32].forEach(x => {
      const finGeo = new THREE.BoxGeometry(0.08, 0.35, 0.5);
      const finMat = new THREE.MeshStandardMaterial({ color: 0x0d9488, metalness: 0.8, roughness: 0.2 });
      const fin = new THREE.Mesh(finGeo, finMat);
      fin.position.set(x, 0.55, -0.7);
      ambulanceVehicle.add(fin);
    });

    ambulanceVehicle.scale.set(0.85, 0.85, 0.85);
    districtGroup.add(ambulanceVehicle);
  }

  // ==========================================
  // Mode 2: Ultra-High Precision 3D Cylinder Twin
  // ==========================================
  function buildCylinderDigitalTwin() {
    // 1. Brushed Chrome High-Pressure Oxygen Tank
    const tankHeight = 9.8;
    const tankRadius = 2.0;

    const tankGeo = new THREE.CylinderGeometry(tankRadius, tankRadius, tankHeight, 48);
    const chromeTankMat = new THREE.MeshStandardMaterial({
      color: 0x0d9488, // Surgical Medical Teal Finish
      metalness: 0.82,
      roughness: 0.18,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1
    });
    const tank = new THREE.Mesh(tankGeo, chromeTankMat);
    tank.position.y = 5.4;
    tank.castShadow = true;
    tank.receiveShadow = true;
    cylinderGroup.add(tank);

    // 2. Hemispherical Seamless Dome Shoulder
    const domeGeo = new THREE.SphereGeometry(tankRadius, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, chromeTankMat);
    dome.position.y = 5.4 + tankHeight / 2;
    cylinderGroup.add(dome);

    // 3. Mirror Chrome Stand Base Ring
    const baseGeo = new THREE.CylinderGeometry(tankRadius * 1.04, tankRadius * 1.08, 0.55, 48);
    const mirrorChromeMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      metalness: 0.98,
      roughness: 0.05
    });
    const base = new THREE.Mesh(baseGeo, mirrorChromeMat);
    base.position.y = 5.4 - tankHeight / 2 + 0.28;
    base.castShadow = true;
    cylinderGroup.add(base);

    // 4. Polished Brass Regulator Valve Neck
    const neckGeo = new THREE.CylinderGeometry(0.68, 0.78, 1.3, 32);
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // Warm Medical Brass
      metalness: 0.92,
      roughness: 0.2
    });
    const neck = new THREE.Mesh(neckGeo, brassMat);
    neck.position.y = 5.4 + tankHeight / 2 + 0.95;
    cylinderGroup.add(neck);

    // Medical Green Flow Handwheel
    const handwheelGeo = new THREE.TorusGeometry(0.72, 0.13, 16, 32);
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x059669, metalness: 0.5, roughness: 0.25 });
    const handwheel = new THREE.Mesh(handwheelGeo, greenMat);
    handwheel.rotation.x = Math.PI / 2;
    handwheel.position.y = 5.4 + tankHeight / 2 + 1.85;
    cylinderGroup.add(handwheel);

    // 5. Precision Analog Pressure Manometer (PSI Dial)
    const gaugeBodyGeo = new THREE.CylinderGeometry(0.72, 0.72, 0.38, 36);
    const gaugeBody = new THREE.Mesh(gaugeBodyGeo, mirrorChromeMat);
    gaugeBody.rotation.z = Math.PI / 2;
    gaugeBody.position.set(1.35, 5.4 + tankHeight / 2 + 0.95, 0);
    cylinderGroup.add(gaugeBody);

    // Dial Face Graphic with Green/Amber/Red Zones
    const dialFaceGeo = new THREE.CircleGeometry(0.64, 36);
    const dialFaceMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const dialFace = new THREE.Mesh(dialFaceGeo, dialFaceMat);
    dialFace.rotation.y = Math.PI / 2;
    dialFace.position.set(1.55, 5.4 + tankHeight / 2 + 0.95, 0);
    cylinderGroup.add(dialFace);

    // High-Precision Red Indicator Needle
    const needleGeo = new THREE.BoxGeometry(0.035, 0.46, 0.02);
    const needleMat = new THREE.MeshBasicMaterial({ color: 0xe11d48 });
    gaugeNeedle = new THREE.Mesh(needleGeo, needleMat);
    gaugeNeedle.position.set(1.56, 5.4 + tankHeight / 2 + 0.95, 0);
    gaugeNeedle.rotation.x = 0.5; // ~2200 PSI
    cylinderGroup.add(gaugeNeedle);

    // 6. Holographic Tamper-Evident Safety Seal
    const sealGeo = new THREE.CylinderGeometry(tankRadius + 0.03, tankRadius + 0.03, 0.75, 48);
    const sealMat = new THREE.MeshStandardMaterial({
      color: 0x047857,
      metalness: 0.85,
      roughness: 0.15
    });
    const seal = new THREE.Mesh(sealGeo, sealMat);
    seal.position.y = 5.4 + tankHeight / 2 - 0.4;
    cylinderGroup.add(seal);

    // 7. Clinical Barcode Plate Decal
    const barcodePlateGeo = new THREE.PlaneGeometry(2.1, 1.25);
    const barcodePlateMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const barcodePlate = new THREE.Mesh(barcodePlateGeo, barcodePlateMat);
    barcodePlate.position.set(0, 5.2, tankRadius + 0.04);
    cylinderGroup.add(barcodePlate);

    // 8. Internal Bubbling Cryo-Gas Particle Stream
    const particleCount = 140;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * (tankRadius * 1.5);
      positions[i * 3 + 1] = 1.0 + Math.random() * (tankHeight - 1.2);
      positions[i * 3 + 2] = (Math.random() - 0.5) * (tankRadius * 1.5);
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x2dd4bf, // Luminous Medical Mint
      size: 0.18,
      transparent: true,
      opacity: 0.8
    });
    internalGasParticles = new THREE.Points(particleGeo, particleMat);
    cylinderGroup.add(internalGasParticles);

    // 9. Floating Gyroscopic HUD Rings
    [3.4, 6.0, 8.6].forEach((yPos, idx) => {
      const ringGeo = new THREE.TorusGeometry(tankRadius * 1.35 + idx * 0.22, 0.025, 8, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: idx === 1 ? 0x059669 : 0x0d9488,
        transparent: true,
        opacity: 0.35
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = yPos;
      ring.rotation.x = Math.PI / 2 + (idx * 0.08);
      cylinderGroup.add(ring);
    });

    // 10. Vent Gas Particles (for Fluid Discharge Stream)
    const ventCount = 100;
    const ventGeo = new THREE.BufferGeometry();
    const ventPos = new Float32Array(ventCount * 3);
    for (let i = 0; i < ventCount; i++) {
      ventPos[i * 3] = -999;
      ventPos[i * 3 + 1] = -999;
      ventPos[i * 3 + 2] = -999;
    }
    ventGeo.setAttribute('position', new THREE.BufferAttribute(ventPos, 3));
    const ventMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.3,
      transparent: true,
      opacity: 0.0
    });
    ventGasParticles = new THREE.Points(ventGeo, ventMat);
    cylinderGroup.add(ventGasParticles);
  }

  // ==========================================
  // Arched 3D Logistics Conduits
  // ==========================================
  function updateTransferCorridors(recommendations) {
    transferCorridors.forEach(c => districtGroup.remove(c));
    transferCorridors = [];

    if (!recommendations || recommendations.length === 0) {
      if (ambulanceVehicle) ambulanceVehicle.visible = false;
      return;
    }

    const topRec = recommendations[0];
    const donorCoords = HOSPITAL_COORDS_3D[topRec.donorId];
    const recipCoords = HOSPITAL_COORDS_3D[topRec.recipientId];

    if (!donorCoords || !recipCoords) return;

    // Arched Spline in 3D Space
    const start = new THREE.Vector3(donorCoords.x, 3.6, donorCoords.z);
    const end = new THREE.Vector3(recipCoords.x, 3.6, recipCoords.z);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mid.y += 5.2;

    ambulanceCurve = new THREE.QuadraticBezierCurve3(start, mid, end);

    const points = ambulanceCurve.getPoints(60);
    const curveGeo = new THREE.BufferGeometry().setFromPoints(points);
    const curveMat = new THREE.LineDashedMaterial({
      color: 0x059669,
      linewidth: 3,
      scale: 1,
      dashSize: 0.7,
      gapSize: 0.35
    });
    const corridorLine = new THREE.Line(curveGeo, curveMat);
    corridorLine.computeLineDistances();
    districtGroup.add(corridorLine);
    transferCorridors.push(corridorLine);

    if (ambulanceVehicle) {
      ambulanceVehicle.visible = true;
    }
  }

  // ==========================================
  // Cinematic Smooth Damping & Camera Math
  // ==========================================
  function updateCameraMath() {
    const phi = currentRotation.x;
    const theta = currentRotation.y;
    const r = currentDistance;

    camera.position.x = currentLookAt.x + r * Math.sin(theta) * Math.cos(phi);
    camera.position.y = currentLookAt.y + r * Math.sin(phi);
    camera.position.z = currentLookAt.z + r * Math.cos(theta) * Math.cos(phi);

    camera.lookAt(currentLookAt);
  }

  function setVisualizerMode(mode) {
    activeMode = mode;

    if (mode === 'GRID') {
      districtGroup.visible = true;
      cylinderGroup.visible = false;
      targetRotation = { x: 0.58, y: -0.55 };
      targetDistance = 34;
      targetLookAt.set(0, 1.2, 0);
    } else if (mode === 'CYLINDER') {
      districtGroup.visible = false;
      cylinderGroup.visible = true;
      targetRotation = { x: 0.28, y: 0.45 };
      targetDistance = 19;
      targetLookAt.set(0, 5.6, 0);
    } else if (mode === 'ORBIT') {
      districtGroup.visible = true;
      cylinderGroup.visible = false;
      targetRotation = { x: 0.85, y: -0.2 };
      targetDistance = 40;
      targetLookAt.set(0, 0, 0);
    }

    // Update active tab buttons in UI
    const btns = document.querySelectorAll('.btn-3d-mode');
    btns.forEach(b => {
      if (b.dataset.mode === mode) {
        b.className = 'btn-3d-mode px-3.5 py-1.5 rounded-lg font-bold text-xs bg-emerald-600 text-white shadow-sm transition cursor-pointer flex items-center gap-1.5';
      } else {
        b.className = 'btn-3d-mode px-3.5 py-1.5 rounded-lg font-semibold text-xs bg-white/80 hover:bg-white text-slate-700 border border-slate-200/90 shadow-2xs transition cursor-pointer flex items-center gap-1.5';
      }
    });

    updateHUDLabels();
  }
  window.setVisualizerMode = setVisualizerMode;

  // ==========================================
  // Live Telemetry Sync with App State
  // ==========================================
  function connectWithAppState() {
    setInterval(() => {
      if (!window.state) return;

      const threshold = window.state.optimizerRules?.emergencyThreshold ?? 20;

      if (window.state.predictions && window.state.predictions.length > 0) {
        const highestId = window.state.hospitalWithMostCylinders || 'HOSP-02';

        window.state.predictions.forEach(p => {
          const node = hospitalNodes[p.hospitalId];
          if (!node) return;

          node.currentStock = p.currentStock || 100;
          const stock = p.currentStock || 0;
          const isEmergency = stock <= threshold;
          const isHighest = p.hospitalId === highestId;

          // Scale building height gracefully
          const targetHeight = Math.max(2.0, Math.min(7.5, (stock / 220) * 6.2));
          node.tower.scale.y = targetHeight / 3.8;
          node.tower.position.y = targetHeight / 2 + 0.25;
          node.collar.position.y = targetHeight + 0.25;
          node.cross.position.y = targetHeight + 0.95;

          // Pristine Apple-Clinical Color Scheme
          let colorHex = 0x0d9488; // Surgical Teal
          if (isEmergency) {
            colorHex = 0xe11d48; // Crimson Alert
          } else if (isHighest) {
            colorHex = 0x059669; // Surplus Emerald
          } else if (p.timeToShortageHours !== null && p.timeToShortageHours <= 6) {
            colorHex = 0xd97706; // Amber Warning
          }

          node.collar.material.color.setHex(colorHex);
          node.crossMat.color.setHex(colorHex);
          node.pulseRing.material.color.setHex(colorHex);
        });

        updateTransferCorridors(window.state.recommendations);
      }

      // Update Pressure Needle
      if (gaugeNeedle && window.state.loggedInHospitalId) {
        const pred = (window.state.predictions || []).find(h => h.hospitalId === window.state.loggedInHospitalId);
        const stock = pred ? pred.currentStock : 100;
        const psiFraction = Math.max(0.1, Math.min(1.0, stock / 200));
        gaugeNeedle.rotation.x = 2.2 - (psiFraction * 2.8);
      }

      updateHUDLabels();
    }, 1000);
  }

  // ==========================================
  // Pristine Projected Screen HUD Badges
  // ==========================================
  function updateHUDLabels() {
    if (!hudOverlayContainer || !camera) return;

    if (activeMode !== 'GRID') {
      hudOverlayContainer.innerHTML = '';
      return;
    }

    const tempV = new THREE.Vector3();
    const widthHalf = container.clientWidth / 2;
    const heightHalf = container.clientHeight / 2;

    let html = '';
    Object.keys(hospitalNodes).forEach(id => {
      const node = hospitalNodes[id];
      const data = HOSPITAL_COORDS_3D[id];
      if (!node || !data) return;

      tempV.set(data.x, node.tower.position.y * 2 + 1.2, data.z);
      tempV.project(camera);

      if (tempV.z > 1) return;

      const x = (tempV.x * widthHalf) + widthHalf;
      const y = -(tempV.y * heightHalf) + heightHalf;

      const threshold = window.state?.optimizerRules?.emergencyThreshold ?? 20;
      const stock = Math.round(node.currentStock || 100);
      const isEmergency = stock <= threshold;
      const isHighest = id === (window.state?.hospitalWithMostCylinders || 'HOSP-02');

      const badgeStyle = isEmergency 
        ? 'bg-rose-50/95 border-rose-300 text-rose-800 shadow-sm' 
        : isHighest 
        ? 'bg-emerald-50/95 border-emerald-300 text-emerald-800 shadow-sm' 
        : 'bg-white/95 border-slate-200/90 text-slate-800 shadow-sm';

      html += `
        <div 
          class="hud-tag-3d ${badgeStyle} cursor-pointer hover:scale-105 transition-all"
          style="left: ${x}px; top: ${y}px;"
          onclick="window.selectHospitalOnMap && window.selectHospitalOnMap('${id}')"
        >
          <span class="font-bold text-slate-900">[${data.letter}]</span>
          <span class="font-semibold">${data.name.split(' ')[0]}</span>
          <span class="font-mono font-bold">${stock} cyl</span>
          ${isEmergency ? '<span class="inline-block w-1.5 h-1.5 rounded-full bg-rose-600 animate-ping ml-0.5"></span>' : ''}
        </div>
      `;
    });

    hudOverlayContainer.innerHTML = html;
  }

  // ==========================================
  // Gestures, Orbit Drag & Raycasting
  // ==========================================
  function setupInteractionControls() {
    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;

        targetRotation.y += deltaX * 0.006;
        targetRotation.x = Math.max(0.12, Math.min(1.42, targetRotation.x + deltaY * 0.006));

        previousMousePosition = { x: e.clientX, y: e.clientY };
      }

      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomDelta = e.deltaY * 0.035;
      const minDistance = activeMode === 'CYLINDER' ? 12 : 20;
      const maxDistance = activeMode === 'CYLINDER' ? 28 : 50;
      targetDistance = Math.max(minDistance, Math.min(maxDistance, targetDistance + zoomDelta));
    }, { passive: false });

    // Touch Support
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }, { passive: true });

    window.addEventListener('touchend', () => {
      isDragging = false;
    });

    window.addEventListener('touchmove', (e) => {
      if (isDragging && e.touches.length === 1) {
        const deltaX = e.touches[0].clientX - previousMousePosition.x;
        const deltaY = e.touches[0].clientY - previousMousePosition.y;

        targetRotation.y += deltaX * 0.006;
        targetRotation.x = Math.max(0.12, Math.min(1.42, targetRotation.x + deltaY * 0.006));

        previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }, { passive: true });

    // Click on 3D Building
    canvas.addEventListener('click', () => {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(districtGroup.children, true);

      if (intersects.length > 0) {
        let parent = intersects[0].object;
        while (parent && !parent.userData?.hospitalId && parent !== districtGroup) {
          parent = parent.parent;
        }

        if (parent && parent.userData?.hospitalId) {
          const hospId = parent.userData.hospitalId;
          if (window.selectHospitalOnMap) {
            window.selectHospitalOnMap(hospId);
          }
          if (window.showToast) {
            window.showToast(`🎯 Focused on ${parent.userData.name}`, 'info');
          }
        }
      }
    });

    // Auto-Rotate Toggle
    const btnAutoRotate = document.getElementById('btnToggle3dAutoRotate');
    if (btnAutoRotate) {
      btnAutoRotate.addEventListener('click', () => {
        isAutoRotate = !isAutoRotate;
        btnAutoRotate.classList.toggle('bg-emerald-100', isAutoRotate);
        btnAutoRotate.classList.toggle('text-emerald-800', isAutoRotate);
        if (window.lucide) lucide.createIcons();
      });
    }

    // Reset Camera
    const btnResetCam = document.getElementById('btnReset3dCamera');
    if (btnResetCam) {
      btnResetCam.addEventListener('click', () => {
        setVisualizerMode(activeMode);
      });
    }

    // Vent Flow Gas Stream Simulation
    const btnVentFlow = document.getElementById('btnVent3dFlow');
    if (btnVentFlow) {
      btnVentFlow.addEventListener('click', triggerVentGasAnimation);
    }
  }

  function triggerVentGasAnimation() {
    if (!ventGasParticles) return;

    if (window.showToast) {
      window.showToast('💨 Clinical purge active: 10L/min USP Oxygen test flow verified', 'info');
    }

    // Play subtle audio chime
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.35);
    } catch (e) {}

    // Animate Puff Particles
    const pos = ventGasParticles.geometry.attributes.position.array;
    const count = pos.length / 3;
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.7;
      pos[i * 3 + 1] = 11.4;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.7;
    }
    ventGasParticles.geometry.attributes.position.needsUpdate = true;
    ventGasParticles.material.opacity = 0.9;

    let progress = 0;
    const ventInterval = setInterval(() => {
      progress += 0.05;
      for (let i = 0; i < count; i++) {
        pos[i * 3] += (Math.random() - 0.5) * 0.2;
        pos[i * 3 + 1] += 0.16;
        pos[i * 3 + 2] += (Math.random() - 0.5) * 0.2;
      }
      ventGasParticles.geometry.attributes.position.needsUpdate = true;
      ventGasParticles.material.opacity = Math.max(0, 0.9 - progress);

      if (progress >= 1.0) {
        clearInterval(ventInterval);
      }
    }, 30);
  }
  window.triggerVentGasAnimation = triggerVentGasAnimation;

  function setupResizeListener() {
    window.addEventListener('resize', () => {
      if (!container || !renderer || !camera) return;
      const width = container.clientWidth;
      const height = container.clientHeight || 460;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      updateHUDLabels();
    });
  }

  // ==========================================
  // 60 FPS Render & Animation Loop
  // ==========================================
  let clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    const elapsedTime = clock.getElapsedTime();

    // 1. Cinematic Fluid Camera Inertia Damping
    if (isAutoRotate && !isDragging) {
      targetRotation.y += cinematicOrbitSpeed;
    }

    currentRotation.x += (targetRotation.x - currentRotation.x) * 0.07;
    currentRotation.y += (targetRotation.y - currentRotation.y) * 0.07;
    currentDistance += (targetDistance - currentDistance) * 0.07;
    currentLookAt.lerp(targetLookAt, 0.07);

    updateCameraMath();

    // 2. Animate Medical Crosses & Radar Rings
    if (activeMode === 'GRID' || activeMode === 'ORBIT') {
      Object.keys(hospitalNodes).forEach((id, idx) => {
        const node = hospitalNodes[id];
        if (!node) return;

        // Gentle cross rotation
        node.cross.rotation.y = elapsedTime * 0.8 + idx;

        // Expanding radar rings
        const waveScale = ((elapsedTime * 0.7 + idx * 0.25) % 1.0);
        node.pulseRing.scale.set(1 + waveScale * 2.6, 1 + waveScale * 2.6, 1);
        node.pulseRing.material.opacity = Math.max(0, 0.65 - waveScale);
      });

      // 3. Animate Autonomous Cryo-Ambulance Shuttle
      if (ambulanceVehicle && ambulanceCurve && ambulanceVehicle.visible) {
        ambulanceProgress = (ambulanceProgress + delta * 0.11) % 1.0;
        const currentPos = ambulanceCurve.getPoint(ambulanceProgress);
        const lookAhead = ambulanceCurve.getPoint(Math.min(1.0, ambulanceProgress + 0.02));

        ambulanceVehicle.position.copy(currentPos);
        ambulanceVehicle.lookAt(lookAhead);
        ambulanceVehicle.rotation.z = Math.sin(ambulanceProgress * Math.PI) * 0.14;
      }
    }

    // 4. Animate Cylinder Digital Twin
    if (activeMode === 'CYLINDER') {
      cylinderGroup.rotation.y = elapsedTime * 0.3;

      if (internalGasParticles) {
        const pos = internalGasParticles.geometry.attributes.position.array;
        const count = pos.length / 3;
        for (let i = 0; i < count; i++) {
          pos[i * 3 + 1] += delta * 1.4;
          if (pos[i * 3 + 1] > 9.8) {
            pos[i * 3 + 1] = 1.0;
          }
        }
        internalGasParticles.geometry.attributes.position.needsUpdate = true;
      }
    }

    // 5. Render Three.js Scene
    renderer.render(scene, camera);

    // 6. Update Screen Labels
    updateHUDLabels();
  }

  // ==========================================
  // Apple Spatial Card 3D Tilt Parallax Engine
  // ==========================================
  function initCard3DTilt() {
    const cards = document.querySelectorAll('.card-3d-tilt, .kpi-card');

    cards.forEach(card => {
      if (!card.querySelector('.glare-overlay')) {
        const glare = document.createElement('div');
        glare.className = 'glare-overlay';
        card.appendChild(glare);
      }

      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        const percentX = (mouseX - centerX) / centerX;
        const percentY = (mouseY - centerY) / centerY;

        // Subtle, elegant 6-degree Apple tilt
        const rotX = -percentY * 5.5;
        const rotY = percentX * 5.5;

        card.style.transform = `perspective(1000px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) translateZ(4px)`;
        card.style.setProperty('--mouse-x', `${mouseX}px`);
        card.style.setProperty('--mouse-y', `${mouseY}px`);
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateZ(0px)';
      });
    });
  }
  window.initCard3DTilt = initCard3DTilt;

})();
