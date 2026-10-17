// 🌟 Interactive 3D Holographic Command Center & Digital Twin Engine 🌟
// Built with Three.js (Hardware Accelerated WebGL) for Cross-Hospital Oxygen Rebalance

(function() {
  'use strict';

  // Check if THREE is loaded
  if (typeof THREE === 'undefined') {
    console.warn('[3D Engine] Three.js not found yet. Retrying in 100ms...');
    setTimeout(initWhenThreeReady, 100);
    return;
  }
  initWhenThreeReady();

  function initWhenThreeReady() {
    if (typeof THREE === 'undefined') {
      setTimeout(initWhenThreeReady, 200);
      return;
    }
    window.addEventListener('DOMContentLoaded', init3D);
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      init3D();
    }
  }

  let scene, camera, renderer;
  let canvas, container;
  let activeMode = 'GRID'; // 'GRID', 'CYLINDER', 'CORRIDORS'
  let isAutoRotate = true;
  let isNightMode = true;

  // Interaction State
  let isDragging = false;
  let previousMousePosition = { x: 0, y: 0 };
  let targetRotation = { x: 0.45, y: -0.6 };
  let currentRotation = { x: 0.45, y: -0.6 };
  let cameraTargetDistance = 32;
  let cameraCurrentDistance = 32;
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2(-999, -999);
  let hoveredObject = null;

  // Scene Objects
  let gridGroup, cylinderGroup, corridorsGroup;
  let hospitalNodes = {};
  let transferCorridors = [];
  let ambulanceVehicle = null;
  let ambulanceCurve = null;
  let ambulanceProgress = 0;
  let internalGasParticles = null;
  let ventGasParticles = null;
  let gaugeNeedle = null;
  let hudOverlayContainer = null;

  // Hospital Spatial Layout in 3D (Hexagonal / Radial Command Grid)
  const HOSPITAL_COORDS_3D = {
    'HOSP-01': { x: -8.5, z: 4.5, name: 'Hospital A (Metro General)', letter: 'A', area: 'Downtown' },
    'HOSP-02': { x: 7.8, z: -5.2, name: 'Hospital B (St. Jude)', letter: 'B', area: 'Uptown' },
    'HOSP-03': { x: -7.2, z: -6.8, name: 'Hospital C (Riverbank)', letter: 'C', area: 'Westside' },
    'HOSP-04': { x: 9.2, z: 5.5, name: 'Hospital D (Oak Valley)', letter: 'D', area: 'Harbor' },
    'HOSP-05': { x: -0.5, z: -10.2, name: 'Hospital E (Mercy Urban)', letter: 'E', area: 'Heights' },
    'HOSP-06': { x: 0.8, z: 9.8, name: 'Hospital F (Highland)', letter: 'F', area: 'Foothills' }
  };

  function init3D() {
    container = document.getElementById('viewport3DContainer');
    canvas = document.getElementById('canvas3dCommand');
    if (!container || !canvas || scene) return;

    hudOverlayContainer = document.getElementById('viewport3dLabels');

    // 1. Scene & Camera Setup
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a1120, 0.015);

    const aspect = container.clientWidth / (container.clientHeight || 450);
    camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    updateCameraPosition();

    // 2. Renderer
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(container.clientWidth, container.clientHeight || 450);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 3. Lighting System
    setupLighting();

    // 4. Construct 3D Sub-Scenes
    gridGroup = new THREE.Group();
    cylinderGroup = new THREE.Group();
    corridorsGroup = new THREE.Group();

    scene.add(gridGroup);
    scene.add(cylinderGroup);
    scene.add(corridorsGroup);

    buildDistrictGrid();
    buildCylinderDigitalTwin();

    // Start with Grid mode visible
    setVisualizerMode('GRID');

    // 5. Setup Event Listeners
    setupControls();
    setupResizeHandler();

    // 6. Connect with Global App State
    connectWithAppState();

    // 7. Initialize Card 3D Tilt Parallax on DOM
    initCard3DTilt();

    // 8. Start 60 FPS Render Loop
    animate();

    console.log('[3D Engine] Spatial 3D Command Center & Digital Twin initialized.');
  }

  // ==========================================
  // Lighting Setup
  // ==========================================
  function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xdcf8ff, 0.65);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(20, 35, 15);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // Cyan Neon Accent Light
    const cyanLight = new THREE.PointLight(0x06b6d4, 1.8, 60);
    cyanLight.position.set(-15, 8, -10);
    scene.add(cyanLight);

    // Emerald Medical Accent Light
    const emeraldLight = new THREE.PointLight(0x10b981, 1.8, 60);
    emeraldLight.position.set(15, 8, 12);
    scene.add(emeraldLight);

    // Rose Emergency Alert Light
    const roseLight = new THREE.PointLight(0xf43f5e, 1.2, 50);
    roseLight.position.set(0, 15, 0);
    scene.add(roseLight);
  }

  // ==========================================
  // Mode 1: 3D District Holographic Grid
  // ==========================================
  function buildDistrictGrid() {
    // Holographic Base Grid & Concentric Radar Rings
    const gridHelper = new THREE.GridHelper(36, 36, 0x06b6d4, 0x1e293b);
    gridHelper.position.y = -0.05;
    gridGroup.add(gridHelper);

    // Glowing Concentric Range Rings (5km, 10km, 15km)
    [6, 12, 18].forEach((radius, i) => {
      const ringGeo = new THREE.RingGeometry(radius - 0.06, radius + 0.06, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.25 - i * 0.05
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.02;
      gridGroup.add(ring);
    });

    // Outer Gyro Pulsing Shield Ring
    const outerGyroGeo = new THREE.TorusGeometry(17.8, 0.08, 16, 100);
    const outerGyroMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.4 });
    const outerGyro = new THREE.Mesh(outerGyroGeo, outerGyroMat);
    outerGyro.rotation.x = Math.PI / 2;
    gridGroup.add(outerGyro);

    // Build the 6 Hospital Nodes
    Object.keys(HOSPITAL_COORDS_3D).forEach(id => {
      const data = HOSPITAL_COORDS_3D[id];
      const nodeGroup = new THREE.Group();
      nodeGroup.position.set(data.x, 0, data.z);
      nodeGroup.userData = { hospitalId: id, name: data.name, letter: data.letter, area: data.area };

      // 1. Hexagonal Base Platform
      const baseGeo = new THREE.CylinderGeometry(2.2, 2.4, 0.4, 6);
      const baseMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.8,
        roughness: 0.3,
        emissive: 0x0f172a
      });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = 0.2;
      base.receiveShadow = true;
      nodeGroup.add(base);

      // 2. Glowing Base Neon Ring
      const neonRingGeo = new THREE.RingGeometry(2.35, 2.45, 6);
      const neonRingMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        side: THREE.DoubleSide
      });
      const neonRing = new THREE.Mesh(neonRingGeo, neonRingMat);
      neonRing.rotation.x = Math.PI / 2;
      neonRing.position.y = 0.42;
      nodeGroup.add(neonRing);

      // 3. Central Futuristic Medical Tower
      const towerHeight = 3.8;
      const towerGeo = new THREE.CylinderGeometry(0.9, 1.2, towerHeight, 8);
      const towerMat = new THREE.MeshStandardMaterial({
        color: 0x24334a,
        metalness: 0.85,
        roughness: 0.2,
        transparent: true,
        opacity: 0.95
      });
      const tower = new THREE.Mesh(towerGeo, towerMat);
      tower.position.y = towerHeight / 2 + 0.4;
      tower.castShadow = true;
      nodeGroup.add(tower);

      // 4. Glowing Medical Beacon Cap
      const capGeo = new THREE.OctahedronGeometry(0.55, 0);
      const capMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.y = towerHeight + 0.9;
      nodeGroup.add(cap);

      // 5. Pulsing Ground Alert Wave Ring
      const pulseGeo = new THREE.RingGeometry(0.5, 0.7, 32);
      const pulseMat = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
      });
      const pulseRing = new THREE.Mesh(pulseGeo, pulseMat);
      pulseRing.rotation.x = Math.PI / 2;
      pulseRing.position.y = 0.05;
      nodeGroup.add(pulseRing);

      // Save references
      hospitalNodes[id] = {
        group: nodeGroup,
        base: base,
        neonRing: neonRing,
        tower: tower,
        cap: cap,
        pulseRing: pulseRing,
        currentStock: 100,
        height: towerHeight
      };

      gridGroup.add(nodeGroup);
    });

    // Build Cryo-Ambulance Vehicle
    buildAmbulanceVehicle();
  }

  // ==========================================
  // Futuristic 3D Cryo-Ambulance Shuttle
  // ==========================================
  function buildAmbulanceVehicle() {
    ambulanceVehicle = new THREE.Group();

    // Sleek Aerodynamic Van Hull
    const hullGeo = new THREE.BoxGeometry(1.6, 0.7, 0.85);
    const hullMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.7,
      roughness: 0.2
    });
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.position.y = 0.4;
    ambulanceVehicle.add(hull);

    // Windshield & Cyber Windows
    const glassGeo = new THREE.BoxGeometry(0.6, 0.4, 0.86);
    const glassMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.set(0.45, 0.55, 0);
    ambulanceVehicle.add(glass);

    // Flashing Emergency Roof Beacon
    const beaconGeo = new THREE.BoxGeometry(0.4, 0.15, 0.35);
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xf43f5e });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, 0.82, 0);
    ambulanceVehicle.add(beacon);

    // Dual Rear Thruster Exhaust
    [-0.25, 0.25].forEach(z => {
      const thrusterGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.3, 12);
      const thrusterMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const thruster = new THREE.Mesh(thrusterGeo, thrusterMat);
      thruster.rotation.z = Math.PI / 2;
      thruster.position.set(-0.9, 0.35, z);
      ambulanceVehicle.add(thruster);
    });

    ambulanceVehicle.scale.set(0.7, 0.7, 0.7);
    gridGroup.add(ambulanceVehicle);
  }

  // ==========================================
  // Mode 2: 3D Medical Oxygen Cylinder Twin
  // ==========================================
  function buildCylinderDigitalTwin() {
    // 1. High-Pressure Steel Tank Body
    const tankHeight = 9.5;
    const tankRadius = 2.0;
    const tankGeo = new THREE.CylinderGeometry(tankRadius, tankRadius, tankHeight, 36);
    const tankMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // Medical Cyan / Cryo-steel
      metalness: 0.85,
      roughness: 0.25,
      clearcoat: 0.4,
      clearcoatRoughness: 0.1
    });
    const tank = new THREE.Mesh(tankGeo, tankMat);
    tank.position.y = 5.2;
    cylinderGroup.add(tank);

    // 2. Hemispherical Domed Shoulder
    const domeGeo = new THREE.SphereGeometry(tankRadius, 36, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, tankMat);
    dome.position.y = 5.2 + tankHeight / 2;
    cylinderGroup.add(dome);

    // 3. Cylinder Base Support Ring
    const baseRingGeo = new THREE.CylinderGeometry(tankRadius * 1.05, tankRadius * 1.08, 0.6, 36);
    const baseRingMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9, roughness: 0.4 });
    const baseRing = new THREE.Mesh(baseRingGeo, baseRingMat);
    baseRing.position.y = 5.2 - tankHeight / 2 + 0.3;
    cylinderGroup.add(baseRing);

    // 4. Brass Neck Collar & High-Flow Valve Assembly
    const neckGeo = new THREE.CylinderGeometry(0.65, 0.75, 1.2, 24);
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd97706, // Polished Medical Brass
      metalness: 0.9,
      roughness: 0.25
    });
    const neck = new THREE.Mesh(neckGeo, brassMat);
    neck.position.y = 5.2 + tankHeight / 2 + 0.9;
    cylinderGroup.add(neck);

    // Valve Handwheel on Top
    const handwheelGeo = new THREE.TorusGeometry(0.7, 0.14, 16, 24);
    const handwheelMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, metalness: 0.6, roughness: 0.3 }); // Green ISO O2 Wheel
    const handwheel = new THREE.Mesh(handwheelGeo, handwheelMat);
    handwheel.rotation.x = Math.PI / 2;
    handwheel.position.y = 5.2 + tankHeight / 2 + 1.8;
    cylinderGroup.add(handwheel);

    // 5. Analog Pressure Manometer Gauge (PSI)
    const gaugeBodyGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.35, 32);
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.95, roughness: 0.1 });
    const gaugeBody = new THREE.Mesh(gaugeBodyGeo, chromeMat);
    gaugeBody.rotation.z = Math.PI / 2;
    gaugeBody.position.set(1.3, 5.2 + tankHeight / 2 + 0.9, 0);
    cylinderGroup.add(gaugeBody);

    // Gauge Dial Face
    const dialFaceGeo = new THREE.CircleGeometry(0.62, 32);
    const dialFaceMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const dialFace = new THREE.Mesh(dialFaceGeo, dialFaceMat);
    dialFace.rotation.y = Math.PI / 2;
    dialFace.position.set(1.48, 5.2 + tankHeight / 2 + 0.9, 0);
    cylinderGroup.add(dialFace);

    // Dial Needle (Animates with Pressure)
    const needleGeo = new THREE.BoxGeometry(0.04, 0.45, 0.02);
    const needleMat = new THREE.MeshBasicMaterial({ color: 0xe11d48 });
    gaugeNeedle = new THREE.Mesh(needleGeo, needleMat);
    gaugeNeedle.position.set(1.49, 5.2 + tankHeight / 2 + 0.9, 0);
    gaugeNeedle.rotation.x = 0.5; // Default angle ~ 2,200 PSI
    cylinderGroup.add(gaugeNeedle);

    // 6. Holographic Tamper Seal Band
    const sealGeo = new THREE.CylinderGeometry(tankRadius + 0.02, tankRadius + 0.02, 0.8, 36);
    const sealMat = new THREE.MeshStandardMaterial({
      color: 0x059669,
      metalness: 0.7,
      roughness: 0.2,
      emissive: 0x047857
    });
    const seal = new THREE.Mesh(sealGeo, sealMat);
    seal.position.y = 5.2 + tankHeight / 2 - 0.4;
    cylinderGroup.add(seal);

    // 7. Barcode Plate Decal
    const barcodePlateGeo = new THREE.PlaneGeometry(2.0, 1.2);
    const barcodePlateMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const barcodePlate = new THREE.Mesh(barcodePlateGeo, barcodePlateMat);
    barcodePlate.position.set(0, 5.0, tankRadius + 0.04);
    cylinderGroup.add(barcodePlate);

    // 8. Internal Bubbling Cryo-Gas Particle Stream (Simulating Liquid/Compressed Oxygen)
    const particleCount = 120;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * (tankRadius * 1.4);
      positions[i * 3 + 1] = 1.0 + Math.random() * (tankHeight - 1.0);
      positions[i * 3 + 2] = (Math.random() - 0.5) * (tankRadius * 1.4);
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x67e8f9,
      size: 0.15,
      transparent: true,
      opacity: 0.85
    });
    internalGasParticles = new THREE.Points(particleGeo, particleMat);
    cylinderGroup.add(internalGasParticles);

    // 9. Floating 3D Telemetry Gyro Rings
    [3.2, 5.8, 8.4].forEach((yPos, idx) => {
      const ringGeo = new THREE.TorusGeometry(tankRadius * 1.35 + idx * 0.25, 0.03, 8, 48);
      const ringMat = new THREE.MeshBasicMaterial({
        color: idx === 1 ? 0x10b981 : 0x06b6d4,
        transparent: true,
        opacity: 0.45
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = yPos;
      ring.rotation.x = Math.PI / 2 + (idx * 0.12);
      cylinderGroup.add(ring);
    });

    // 10. Vent Gas Particle Stream (for Interactive Discharge)
    const ventCount = 80;
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
      size: 0.25,
      transparent: true,
      opacity: 0.0
    });
    ventGasParticles = new THREE.Points(ventGeo, ventMat);
    cylinderGroup.add(ventGasParticles);
  }

  // ==========================================
  // Mode 3: Dynamic 3D Logistics Conduits
  // ==========================================
  function updateTransferCorridors(recommendations) {
    // Clear old corridors
    transferCorridors.forEach(c => gridGroup.remove(c));
    transferCorridors = [];

    if (!recommendations || recommendations.length === 0) {
      if (ambulanceVehicle) ambulanceVehicle.visible = false;
      return;
    }

    const topRec = recommendations[0];
    const donorCoords = HOSPITAL_COORDS_3D[topRec.donorId];
    const recipCoords = HOSPITAL_COORDS_3D[topRec.recipientId];

    if (!donorCoords || !recipCoords) return;

    // Build Arched 3D Bezier Spline
    const start = new THREE.Vector3(donorCoords.x, 3.5, donorCoords.z);
    const end = new THREE.Vector3(recipCoords.x, 3.5, recipCoords.z);
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    mid.y += 5.5; // Elevated arc

    ambulanceCurve = new THREE.QuadraticBezierCurve3(start, mid, end);

    const points = ambulanceCurve.getPoints(50);
    const curveGeo = new THREE.BufferGeometry().setFromPoints(points);
    const curveMat = new THREE.LineDashedMaterial({
      color: 0x4f46e5,
      linewidth: 3,
      scale: 1,
      dashSize: 0.8,
      gapSize: 0.4
    });
    const corridorLine = new THREE.Line(curveGeo, curveMat);
    corridorLine.computeLineDistances();
    gridGroup.add(corridorLine);
    transferCorridors.push(corridorLine);

    if (ambulanceVehicle) {
      ambulanceVehicle.visible = true;
    }
  }

  // ==========================================
  // Camera & Mode Switching
  // ==========================================
  function updateCameraPosition() {
    const phi = currentRotation.x;
    const theta = currentRotation.y;
    const r = cameraCurrentDistance;

    camera.position.x = r * Math.sin(theta) * Math.cos(phi);
    camera.position.y = r * Math.sin(phi);
    camera.position.z = r * Math.cos(theta) * Math.cos(phi);

    const targetY = activeMode === 'CYLINDER' ? 5.5 : 1.5;
    camera.lookAt(0, targetY, 0);
  }

  function setVisualizerMode(mode) {
    activeMode = mode;

    if (mode === 'GRID') {
      gridGroup.visible = true;
      cylinderGroup.visible = false;
      targetRotation = { x: 0.52, y: -0.6 };
      cameraTargetDistance = 32;
    } else if (mode === 'CYLINDER') {
      gridGroup.visible = false;
      cylinderGroup.visible = true;
      targetRotation = { x: 0.25, y: 0.4 };
      cameraTargetDistance = 18;
    } else if (mode === 'CORRIDORS') {
      gridGroup.visible = true;
      cylinderGroup.visible = false;
      targetRotation = { x: 0.95, y: -0.2 }; // Top-down tactical aerial view
      cameraTargetDistance = 38;
    }

    // Update active button state in UI
    const btns = document.querySelectorAll('.btn-3d-mode');
    btns.forEach(b => {
      if (b.dataset.mode === mode) {
        b.className = 'btn-3d-mode px-3 py-1.5 rounded-lg font-bold text-xs bg-cyan-500 text-slate-950 shadow-md transition cursor-pointer flex items-center gap-1.5';
      } else {
        b.className = 'btn-3d-mode px-3 py-1.5 rounded-lg font-semibold text-xs bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer flex items-center gap-1.5';
      }
    });

    updateHUDLabels();
  }
  window.setVisualizerMode = setVisualizerMode;

  // ==========================================
  // Live Telemetry Sync with App State
  // ==========================================
  function connectWithAppState() {
    // Poll or hook into window.state
    setInterval(() => {
      if (!window.state) return;

      const threshold = window.state.optimizerRules?.emergencyThreshold ?? 20;

      // Update Hospital 3D Node Heights & Status Colors
      if (window.state.predictions && window.state.predictions.length > 0) {
        const highestId = window.state.hospitalWithMostCylinders || 'HOSP-02';

        window.state.predictions.forEach(p => {
          const node = hospitalNodes[p.hospitalId];
          if (!node) return;

          node.currentStock = p.currentStock || 100;
          const stock = p.currentStock || 0;
          const isEmergency = stock <= threshold;
          const isHighest = p.hospitalId === highestId;

          // Scale building height proportional to stock
          const targetHeight = Math.max(1.8, Math.min(8.0, (stock / 220) * 6.5));
          node.tower.scale.y = targetHeight / 3.8;
          node.tower.position.y = targetHeight / 2 + 0.4;
          node.cap.position.y = targetHeight + 0.8;

          // Color themes
          let colorHex = 0x06b6d4; // Cyan standard
          if (isEmergency) {
            colorHex = 0xf43f5e; // Critical Rose
          } else if (isHighest) {
            colorHex = 0x10b981; // Surplus Emerald
          } else if (p.timeToShortageHours !== null && p.timeToShortageHours <= 6) {
            colorHex = 0xf59e0b; // Amber Warning
          }

          node.neonRing.material.color.setHex(colorHex);
          node.cap.material.color.setHex(colorHex);
          node.pulseRing.material.color.setHex(colorHex);

          // Tower emissive aura
          node.tower.material.emissive.setHex(isEmergency ? 0x881337 : isHighest ? 0x064e3b : 0x0f172a);
        });

        // Update 3D Corridor spline
        updateTransferCorridors(window.state.recommendations);
      }

      // Update Gauge Needle if in Cylinder Mode
      if (gaugeNeedle && window.state.loggedInHospitalId) {
        const pred = (window.state.predictions || []).find(h => h.hospitalId === window.state.loggedInHospitalId);
        const stock = pred ? pred.currentStock : 100;
        // Map 0 - 250 cylinders to needle rotation
        const psiFraction = Math.max(0.1, Math.min(1.0, stock / 200));
        gaugeNeedle.rotation.x = 2.2 - (psiFraction * 2.8);
      }

      updateHUDLabels();
    }, 1000);
  }

  // ==========================================
  // 3D Projected Screen Labels (HUD)
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

      // Check if behind camera
      if (tempV.z > 1) return;

      const x = (tempV.x * widthHalf) + widthHalf;
      const y = -(tempV.y * heightHalf) + heightHalf;

      const threshold = window.state?.optimizerRules?.emergencyThreshold ?? 20;
      const stock = Math.round(node.currentStock || 100);
      const isEmergency = stock <= threshold;
      const isHighest = id === (window.state?.hospitalWithMostCylinders || 'HOSP-02');

      const badgeBg = isEmergency 
        ? 'bg-rose-950/90 border-rose-500 text-rose-300' 
        : isHighest 
        ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300' 
        : 'bg-slate-900/85 border-cyan-500 text-cyan-300';

      html += `
        <div 
          class="hud-tag-3d ${badgeBg} cursor-pointer hover:scale-105 transition-all"
          style="left: ${x}px; top: ${y}px;"
          onclick="window.selectHospitalOnMap && window.selectHospitalOnMap('${id}')"
        >
          <span class="font-bold text-white">[${data.letter}]</span>
          <span>${data.name.split(' ')[0]}</span>
          <span class="font-mono font-bold">${stock} cyl</span>
          ${isEmergency ? '<span class="inline-block w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping ml-0.5"></span>' : ''}
        </div>
      `;
    });

    hudOverlayContainer.innerHTML = html;
  }

  // ==========================================
  // Interactive Controls & Gestures
  // ==========================================
  function setupControls() {
    // Mouse Drag Rotation
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

        targetRotation.y += deltaX * 0.007;
        targetRotation.x = Math.max(0.05, Math.min(1.45, targetRotation.x + deltaY * 0.007));

        previousMousePosition = { x: e.clientX, y: e.clientY };
      }

      // Track mouse for 3D Raycasting
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    });

    // Touch Gestures for Mobile
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

        targetRotation.y += deltaX * 0.007;
        targetRotation.x = Math.max(0.05, Math.min(1.45, targetRotation.x + deltaY * 0.007));

        previousMousePosition = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    }, { passive: true });

    // Mouse Wheel Zoom
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomDelta = e.deltaY * 0.03;
      const minDistance = activeMode === 'CYLINDER' ? 10 : 18;
      const maxDistance = activeMode === 'CYLINDER' ? 30 : 55;
      cameraTargetDistance = Math.max(minDistance, Math.min(maxDistance, cameraTargetDistance + zoomDelta));
    }, { passive: false });

    // Click on 3D Object (Select Hospital)
    canvas.addEventListener('click', () => {
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(gridGroup.children, true);

      if (intersects.length > 0) {
        let parent = intersects[0].object;
        while (parent && !parent.userData?.hospitalId && parent !== gridGroup) {
          parent = parent.parent;
        }

        if (parent && parent.userData?.hospitalId) {
          const hospId = parent.userData.hospitalId;
          if (window.selectHospitalOnMap) {
            window.selectHospitalOnMap(hospId);
          }
          if (window.showToast) {
            window.showToast(`🎯 Selected ${parent.userData.name} in 3D Command Grid`, 'info');
          }
        }
      }
    });

    // Auto-Rotate Toggle Button
    const btnAutoRotate = document.getElementById('btnToggle3dAutoRotate');
    if (btnAutoRotate) {
      btnAutoRotate.addEventListener('click', () => {
        isAutoRotate = !isAutoRotate;
        btnAutoRotate.innerHTML = isAutoRotate 
          ? `<i data-lucide="rotate-cw" class="h-3.5 w-3.5"></i><span>Auto-Rotate: ON</span>` 
          : `<i data-lucide="pause" class="h-3.5 w-3.5"></i><span>Auto-Rotate: OFF</span>`;
        if (window.lucide) lucide.createIcons();
      });
    }

    // Reset Camera Button
    const btnResetCam = document.getElementById('btnReset3dCamera');
    if (btnResetCam) {
      btnResetCam.addEventListener('click', () => {
        setVisualizerMode(activeMode);
      });
    }

    // Vent Flow Simulation Button
    const btnVentFlow = document.getElementById('btnVent3dFlow');
    if (btnVentFlow) {
      btnVentFlow.addEventListener('click', triggerVentGasAnimation);
    }
  }

  // Vent Gas Particle Release Animation
  function triggerVentGasAnimation() {
    if (!ventGasParticles) return;

    if (window.showToast) {
      window.showToast('💨 Pressure purge activated: 10L/min clinical cryo-flush test', 'info');
    }

    // Play subtle hiss audio
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const bufferSize = audioCtx.sampleRate * 0.4;
      const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = audioCtx.createBufferSource();
      whiteNoise.buffer = buffer;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      whiteNoise.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      whiteNoise.start();
    } catch (e) {}

    // Animate 3D Particles
    const pos = ventGasParticles.geometry.attributes.position.array;
    const count = pos.length / 3;
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.8;
      pos[i * 3 + 1] = 11.2; // Top of regulator valve
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.8;
    }
    ventGasParticles.geometry.attributes.position.needsUpdate = true;
    ventGasParticles.material.opacity = 0.95;

    let progress = 0;
    const ventInterval = setInterval(() => {
      progress += 0.05;
      for (let i = 0; i < count; i++) {
        pos[i * 3] += (Math.random() - 0.5) * 0.25;
        pos[i * 3 + 1] += 0.18;
        pos[i * 3 + 2] += (Math.random() - 0.5) * 0.25;
      }
      ventGasParticles.geometry.attributes.position.needsUpdate = true;
      ventGasParticles.material.opacity = Math.max(0, 0.95 - progress);

      if (progress >= 1.0) {
        clearInterval(ventInterval);
      }
    }, 30);
  }
  window.triggerVentGasAnimation = triggerVentGasAnimation;

  // Window Resize
  function setupResizeHandler() {
    window.addEventListener('resize', () => {
      if (!container || !renderer || !camera) return;
      const width = container.clientWidth;
      const height = container.clientHeight || 450;
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

    // 1. Smooth Camera Inertia Damping
    if (isAutoRotate && !isDragging) {
      targetRotation.y += 0.0035;
    }

    currentRotation.x += (targetRotation.x - currentRotation.x) * 0.08;
    currentRotation.y += (targetRotation.y - currentRotation.y) * 0.08;
    cameraCurrentDistance += (cameraTargetDistance - cameraCurrentDistance) * 0.08;

    updateCameraPosition();

    // 2. Animate Hospital Beacons & Pulse Waves
    if (activeMode === 'GRID' || activeMode === 'CORRIDORS') {
      Object.keys(hospitalNodes).forEach((id, idx) => {
        const node = hospitalNodes[id];
        if (!node) return;

        // Rotate beacon octahedron
        node.cap.rotation.y += 0.02;
        node.cap.rotation.x = Math.sin(elapsedTime * 2 + idx) * 0.2;

        // Expanding radar ring
        const waveScale = ((elapsedTime * 0.8 + idx * 0.3) % 1.0);
        node.pulseRing.scale.set(1 + waveScale * 2.8, 1 + waveScale * 2.8, 1);
        node.pulseRing.material.opacity = Math.max(0, 0.8 - waveScale);
      });

      // 3. Animate Autonomous Cryo-Ambulance along Bezier Spline
      if (ambulanceVehicle && ambulanceCurve && ambulanceVehicle.visible) {
        ambulanceProgress = (ambulanceProgress + delta * 0.12) % 1.0;
        const currentPos = ambulanceCurve.getPoint(ambulanceProgress);
        const lookAhead = ambulanceCurve.getPoint(Math.min(1.0, ambulanceProgress + 0.02));

        ambulanceVehicle.position.copy(currentPos);
        ambulanceVehicle.lookAt(lookAhead);

        // Gentle chassis bank
        ambulanceVehicle.rotation.z = Math.sin(ambulanceProgress * Math.PI) * 0.18;
      }
    }

    // 4. Animate Cylinder Digital Twin
    if (activeMode === 'CYLINDER') {
      // Rotate cylinder slowly
      cylinderGroup.rotation.y = elapsedTime * 0.35;

      // Animate bubbling gas particles inside
      if (internalGasParticles) {
        const pos = internalGasParticles.geometry.attributes.position.array;
        const count = pos.length / 3;
        for (let i = 0; i < count; i++) {
          pos[i * 3 + 1] += delta * 1.5;
          if (pos[i * 3 + 1] > 9.5) {
            pos[i * 3 + 1] = 1.0;
          }
        }
        internalGasParticles.geometry.attributes.position.needsUpdate = true;
      }
    }

    // 5. Render Scene
    renderer.render(scene, camera);

    // 6. Project 3D HUD Tags on Screen
    updateHUDLabels();
  }

  // ==========================================
  // Card 3D Tilt & Specular Parallax Engine
  // ==========================================
  function initCard3DTilt() {
    const cards = document.querySelectorAll('.card-3d-tilt, .kpi-card');

    cards.forEach(card => {
      // Add specular glare overlay element if not already present
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

        // Apply 3D perspective rotation (up to 9 degrees)
        const rotX = -percentY * 8.5;
        const rotY = percentX * 8.5;

        card.style.transform = `perspective(1000px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) translateZ(8px)`;
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
