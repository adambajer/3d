// Assumes that THREE, THREE.OBJLoader, THREE.MTLLoader, THREE.OrbitControls, and nipplejs are already loaded.

class ModelLoader {
    constructor(renderContainer) {
      this.renderContainer = renderContainer;
  
      // Create the scene.
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0xe0e0e0);
  
      // Setup camera.
      this.camera = new THREE.PerspectiveCamera(
        50,
        renderContainer.clientWidth / renderContainer.clientHeight,
        0.1,
        1000
      );
      this.camera.position.set(0, 0, 0);
      this.camera.up.set(0, 1, 0);
  
      // Setup renderer.
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.setSize(renderContainer.clientWidth, renderContainer.clientHeight);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderContainer.appendChild(this.renderer.domElement);
  
      // Add floor and lights.
      this.createInfiniteFloor();
      this.addLights();
  
      // Setup OrbitControls (default navigation mode).
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.25;
      this.controls.target.set(0, 0, 0);
      this.controls.update();
  
      // First-person (walking) settings.
      this.isFirstPerson = false;
      this.firstPersonSettings = {
        moveSpeed: 0.02,
        direction: new THREE.Vector3(),
        groundLevel: 0,
      };
  
      // Save original camera view.
      this.originalCameraPosition = null;
      this.originalControlsTarget = null;
      this.originalCameraFOV = null;
  
      // Configurable offset for first-person start (relative to model center).
      this.firstPersonStartOffset = { x: -1, y: 0.1, z: -1 };
  
      // Will be set once the model is loaded.
      this.firstPersonStartPosition = null;
      // Blue marker for the start position.
      this.firstPersonMarker = null;
  
      // For FPS-style rotation, maintain target yaw/pitch and a target quaternion.
      this.yaw = 0;
      this.pitch = 0;
      this.targetYaw = 0;
      this.targetPitch = 0;
      this.targetQuat = new THREE.Quaternion();
      this.mouseSensitivity = 0.002;
      // Clamp pitch so that it never goes below 0° (cannot look up)
      // and up to, say, +85° (looking down).
      this.pitchClamp = THREE.MathUtils.degToRad(85);
      // Set lookDistance to a small fixed value so that the lookAt target is always close.
      this.lookDistance = 2;
  
      // Create a crosshair overlay (only visible in first-person mode).
      this.createCrosshair();
      // Create a debug overlay.
      this.createDebugOverlay();
      // Create a green marker to show the computed lookAt target.
      this.lookAtMarker = this.createLookAtMarker();
  
      // Keyboard input for WSAD.
      this.keyboard = { w: false, a: false, s: false, d: false };
      window.addEventListener("keydown", (event) => {
        if (this.isFirstPerson) {
          switch (event.key.toLowerCase()) {
            case "w": this.keyboard.w = true; break;
            case "a": this.keyboard.a = true; break;
            case "s": this.keyboard.s = true; break;
            case "d": this.keyboard.d = true; break;
          }
        }
      });
      window.addEventListener("keyup", (event) => {
        if (this.isFirstPerson) {
          switch (event.key.toLowerCase()) {
            case "w": this.keyboard.w = false; break;
            case "a": this.keyboard.a = false; break;
            case "s": this.keyboard.s = false; break;
            case "d": this.keyboard.d = false; break;
          }
        }
      });
  
      // Pointer lock & mouse movement for FPS rotation.
      this.onMouseMove = this.onMouseMove.bind(this);
      document.addEventListener("mousemove", this.onMouseMove, false);
      document.addEventListener("pointerlockchange", () => {
        if (document.pointerLockElement !== this.renderer.domElement && this.isFirstPerson) {
          this.toggleFirstPerson();
        }
      }, false);
  
      // Mobile device orientation (for mobile look mode).
      this.isMobileLookEnabled = false;
      this.deviceOrientation = { alpha: 0, beta: 0, gamma: 0 };
      window.addEventListener("deviceorientation", (event) => {
        if (this.isMobileLookEnabled) {
          this.deviceOrientation.alpha = event.alpha;
          this.deviceOrientation.beta = event.beta;
          this.deviceOrientation.gamma = event.gamma;
        }
      }, true);
  
      // Setup raycaster for part selection.
      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();
      this.setupPartSelection();
  
      // Setup virtual joystick for movement.
      this.setupVirtualJoystick();
  
      // Collision: We will use the model's bounding box to determine if the camera is inside.
      // We'll update this in loadModel.
      this.sceneBoundaries = new THREE.Box3();
  
      // Start the render loop.
      this.animate();
  
      // Automatically load the model.
      this.loadModel("./mapa3dsestava.obj", "./mapa3dsestava.mtl");
    }
  
    // Create a crosshair overlay.
    createCrosshair() {
      let crosshair = document.createElement("div");
      crosshair.id = "crosshair";
      crosshair.style.position = "absolute";
      crosshair.style.left = "50%";
      crosshair.style.top = "50%";
      crosshair.style.transform = "translate(-50%, -50%)";
      crosshair.style.color = "white";
      crosshair.style.fontSize = "32px";
      crosshair.style.fontWeight = "bold";
      crosshair.style.pointerEvents = "none";
      crosshair.innerText = "+";
      crosshair.style.display = "none"; // hidden by default
      this.renderContainer.style.position = "relative";
      this.renderContainer.appendChild(crosshair);
    }
  
    // Create a debug overlay to show yaw and pitch.
    createDebugOverlay() {
      let debugDiv = document.createElement("div");
      debugDiv.id = "debug-info";
      debugDiv.style.position = "absolute";
      debugDiv.style.bottom = "10px";
      debugDiv.style.left = "10px";
      debugDiv.style.color = "lime";
      debugDiv.style.fontSize = "16px";
      debugDiv.style.backgroundColor = "rgba(0,0,0,0.5)";
      debugDiv.style.padding = "5px";
      debugDiv.style.pointerEvents = "none";
      this.renderContainer.appendChild(debugDiv);
    }
  
    // Create a green marker to display the computed lookAt target.
    createLookAtMarker() {
      const geom = new THREE.SphereGeometry(0.2, 16, 16);
      const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00, depthTest: false });
      const marker = new THREE.Mesh(geom, mat);
      marker.renderOrder = 9999;
      this.scene.add(marker);
      return marker;
    }
  
    // A simple raycasting method to determine if a point is inside a closed mesh.
    // Cast a ray in the +X direction and count intersections.
    isPointInsideMesh(point, mesh) {
      const raycaster = new THREE.Raycaster();
      raycaster.set(point, new THREE.Vector3(1, 0, 0));
      const intersects = raycaster.intersectObject(mesh, true);
      // If the count is odd, the point is inside.
      return (intersects.length % 2) === 1;
    }
  
    onMouseMove(event) {
      if (this.isFirstPerson && document.pointerLockElement === this.renderer.domElement) {
        // Update target yaw/pitch.
        this.targetYaw -= event.movementX * this.mouseSensitivity;
        this.targetPitch -= event.movementY * this.mouseSensitivity;
        // Clamp pitch to [0, pitchClamp] so it never goes below 0° (cannot look up).
        this.targetPitch = THREE.MathUtils.clamp(this.targetPitch, 0, this.pitchClamp);
        const euler = new THREE.Euler(this.targetPitch, this.targetYaw, 0, "YXZ");
        this.targetQuat.setFromEuler(euler);
      }
    }
  
    addLights() {
      const ambient = new THREE.AmbientLight(0xffffff, 0.5);
      this.scene.add(ambient);
  
      const directional = new THREE.DirectionalLight(0xffffff, 0.8);
      directional.position.set(5, 5, 0);
      directional.castShadow = true;
      directional.shadow.camera.left = -10;
      directional.shadow.camera.right = 10;
      directional.shadow.camera.top = 10;
      directional.shadow.camera.bottom = -10;
      directional.shadow.camera.near = 0.5;
      directional.shadow.camera.far = 50;
      directional.shadow.mapSize.set(4096, 4096);
      this.scene.add(directional);
    }
  
    createInfiniteFloor() {
      const geometry = new THREE.PlaneGeometry(1000, 1000);
      const material = new THREE.MeshStandardMaterial({
        color: 0x9a9a9a,
        side: THREE.DoubleSide,
      });
      const floor = new THREE.Mesh(geometry, material);
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      floor.name = "Ground";
      this.scene.add(floor);
      this.floor = floor;
    }
  
    setupVirtualJoystick() {
      const joystickContainer = document.getElementById("virtual-joystick");
      if (!joystickContainer) return;
      joystickContainer.style.display = "none"; // hidden by default
      this.joystick = nipplejs.create({
        zone: joystickContainer,
        mode: "static",
        position: { left: "50%", top: "50%" },
        color: "rgba(255,0,0,0.8)",
        size: 120,
      });
      this.joystick.on("move", (evt, data) => {
        if (this.isFirstPerson) {
          const inputX = data.vector.x / 5;
          const inputY = data.vector.y / 5;
          const forward = new THREE.Vector3();
          this.camera.getWorldDirection(forward);
          forward.y = 0;
          forward.normalize();
          const right = new THREE.Vector3();
          right.crossVectors(forward, this.camera.up).normalize();
          const moveDir = new THREE.Vector3()
            .copy(forward)
            .multiplyScalar(inputY)
            .add(right.multiplyScalar(inputX));
          this.firstPersonSettings.direction.copy(moveDir);
        }
      });
      this.joystick.on("end", () => {
        if (this.isFirstPerson) {
          this.firstPersonSettings.direction.set(0, 0, 0);
        }
      });
    }
  
    setupPartSelection() {
      this.renderContainer.addEventListener("click", (event) => {
        const rect = this.renderContainer.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        if (this.currentModel) {
          const intersects = this.raycaster.intersectObject(this.currentModel, true);
          if (intersects.length > 0) {
            const selected = intersects[0].object;
            this.highlightObject(selected);
            const partInfo = document.getElementById("part-info");
            if (partInfo) {
              partInfo.textContent = `Selected Part: ${selected.name || "Unnamed"}`;
            }
          }
        }
      });
    }
  
    highlightObject(object) {
      if (this.previousHighlight) {
        this.previousHighlight.material.color.set(this.previousColor);
      }
      this.previousHighlight = object;
      this.previousColor = object.material.color.clone();
      object.material.color.set(0xff0000);
    }
  
    loadModel(objPath, mtlPath) {
      if (this.currentModel) {
        this.scene.remove(this.currentModel);
      }
      const mtlLoader = new THREE.MTLLoader();
      const objLoader = new THREE.OBJLoader();
      mtlLoader.load(
        mtlPath,
        (materials) => {
          materials.preload();
          objLoader.setMaterials(materials);
          objLoader.load(
            objPath,
            (object) => {
              object.rotation.x = -Math.PI / 2;
              object.traverse((child) => {
                if (child.isMesh) {
                  child.castShadow = true;
                  child.receiveShadow = true;
                  if (!child.name) {
                    child.name = `Mesh_${Math.random().toString(36).substr(2, 9)}`;
                  }
                }
              });
              this.currentModel = object;
              // Center and scale the model.
              let box = new THREE.Box3().setFromObject(object);
              const size = box.getSize(new THREE.Vector3());
              const maxDim = Math.max(size.x, size.y, size.z);
              const scaleFactor = 5 / maxDim;
              object.scale.set(scaleFactor, scaleFactor, scaleFactor);
              // Recompute bounding box after scaling.
              box = new THREE.Box3().setFromObject(object);
              const center = box.getCenter(new THREE.Vector3());
              object.position.set(-center.x, -box.min.y, -center.z);
              // Update scene boundaries.
              this.sceneBoundaries.copy(box);
              // Set ground level (assume model sits on y = 0).
              this.firstPersonSettings.groundLevel = 0;
              this.scene.add(object);
              this.fitCameraToObject();
              // Set up the first-person start position.
              this.firstPersonStartPosition = new THREE.Vector3(
                center.x + this.firstPersonStartOffset.x,
                this.firstPersonSettings.groundLevel + this.firstPersonStartOffset.y,
                center.z + this.firstPersonStartOffset.z
              );
              // Create a blue marker at the start position.
              if (!this.firstPersonMarker) {
                const markerGeometry = new THREE.SphereGeometry(0.1, 16, 16);
                const markerMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
                this.firstPersonMarker = new THREE.Mesh(markerGeometry, markerMaterial);
                this.firstPersonMarker.position.copy(this.firstPersonStartPosition);
                this.scene.add(this.firstPersonMarker);
              }
            },
            undefined,
            (error) => {
              console.error("Error loading OBJ:", error);
            }
          );
        },
        undefined,
        (error) => {
          console.error("Error loading MTL:", error);
        }
      );
    }
  
    fitCameraToObject() {
      if (!this.currentModel) return;
      const box = new THREE.Box3().setFromObject(this.currentModel);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fovRadians = this.camera.fov * (Math.PI / 180);
      const cameraDistance = Math.abs(maxDim / (2 * Math.tan(fovRadians / 2))) * 2;
      this.camera.position.copy(center);
      this.camera.position.y += maxDim / 2;
      this.camera.position.z += cameraDistance;
      this.camera.lookAt(center);
      this.controls.target.copy(center);
      this.controls.update();
    }
  
    updateFirstPersonMovement() {
      if (this.isFirstPerson && this.currentModel) {
        // Compute movement direction.
        let forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        let right = new THREE.Vector3();
        right.crossVectors(forward, this.camera.up).normalize();
        let keyboardDir = new THREE.Vector3();
        if (this.keyboard.w) keyboardDir.add(forward);
        if (this.keyboard.s) keyboardDir.sub(forward);
        if (this.keyboard.a) keyboardDir.sub(right);
        if (this.keyboard.d) keyboardDir.add(right);
        if (keyboardDir.length() > 0) keyboardDir.normalize();
        let combinedDir = new THREE.Vector3();
        combinedDir.add(this.firstPersonSettings.direction);
        combinedDir.add(keyboardDir);
        if (combinedDir.length() > 0) combinedDir.normalize();
        const moveVector = combinedDir.multiplyScalar(this.firstPersonSettings.moveSpeed);
        const newPos = this.camera.position.clone().add(moveVector);
        // Collision detection: Allow movement only if the new point remains inside the model
        // if the camera is already inside, or outside if the camera is outside.
        const currentInside = this.isPointInsideMesh(this.camera.position, this.currentModel);
        const newInside = this.isPointInsideMesh(newPos, this.currentModel);
        if (currentInside === newInside) {
          this.camera.position.copy(newPos);
          this.camera.position.y = this.firstPersonSettings.groundLevel + 0.1;
        }
      }
    }
  
    isWithinSceneBoundaries(x, z) {
      return true; // Not used in this version.
    }
  
    // Simple point-in-mesh test using raycasting.
    isPointInsideMesh(point, mesh) {
      const raycaster = new THREE.Raycaster();
      // Cast a ray from the point in the +X direction.
      raycaster.set(point, new THREE.Vector3(1, 0, 0));
      const intersects = raycaster.intersectObject(mesh, true);
      // If odd number of intersections, point is inside.
      return (intersects.length % 2) === 1;
    }
  
    updateMobileLook() {
      if (this.isMobileLookEnabled) {
        const alpha = this.deviceOrientation.alpha ? THREE.MathUtils.degToRad(this.deviceOrientation.alpha) : 0;
        const beta = this.deviceOrientation.beta ? THREE.MathUtils.degToRad(this.deviceOrientation.beta) : 0;
        const gamma = this.deviceOrientation.gamma ? THREE.MathUtils.degToRad(this.deviceOrientation.gamma) : 0;
        const orient = window.orientation ? THREE.MathUtils.degToRad(window.orientation) : 0;
        
        const euler = new THREE.Euler(beta, alpha, -gamma, 'YXZ');
        const q1 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -orient);
        const targetMobileQuat = new THREE.Quaternion().setFromEuler(euler).multiply(q1);
        
        this.camera.quaternion.slerp(targetMobileQuat, 0.1);
        
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
        const lookAtTarget = this.camera.position.clone().add(forward.multiplyScalar(this.lookDistance));
        
        if (this.lookAtMarker) this.lookAtMarker.position.copy(lookAtTarget);
        
        const debugDiv = document.getElementById("debug-info");
        if (debugDiv) {
          const yaw = THREE.MathUtils.radToDeg(THREE.MathUtils.euclideanModulo(euler.y, 2 * Math.PI)).toFixed(1);
          const pitch = THREE.MathUtils.radToDeg(euler.x).toFixed(1);
          debugDiv.innerText = `Mobile Yaw: ${yaw}°\nMobile Pitch: ${pitch}°`;
        }
      }
    }
  
    animate() {
      requestAnimationFrame(() => this.animate());
      if (this.isFirstPerson) {
        const damping = 0.1;
        // Smoothly interpolate yaw and pitch toward target values.
        this.yaw = THREE.MathUtils.lerp(this.yaw, this.targetYaw, damping);
        this.pitch = THREE.MathUtils.lerp(this.pitch, this.targetPitch, damping);
        // Clamp pitch so that it never goes below 0°.
        this.pitch = THREE.MathUtils.clamp(this.pitch, 0, this.pitchClamp);
        const euler = new THREE.Euler(this.pitch, this.yaw, 0, "YXZ");
        this.targetQuat.setFromEuler(euler);
        this.camera.quaternion.slerp(this.targetQuat, damping);
        
        // Compute forward direction from camera quaternion.
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
        const lookAtTarget = this.camera.position.clone().add(forward.multiplyScalar(this.lookDistance));
        if (this.lookAtMarker) this.lookAtMarker.position.copy(lookAtTarget);
        
        const normalizedYaw = THREE.MathUtils.radToDeg(THREE.MathUtils.euclideanModulo(this.yaw, 2 * Math.PI)).toFixed(1);
        const pitchDeg = THREE.MathUtils.radToDeg(this.pitch).toFixed(1);
        const debugDiv = document.getElementById("debug-info");
        if (debugDiv) {
          debugDiv.innerText = `Yaw: ${normalizedYaw}°\nPitch: ${pitchDeg}°`;
        }
      }
      this.updateFirstPersonMovement();
      this.updateMobileLook();
      if (!this.isFirstPerson && !this.isMobileLookEnabled) {
        this.controls.update();
      }
      this.renderer.render(this.scene, this.camera);
    }
  
    // Toggle first-person mode.
    toggleFirstPerson() {
      const joystickElem = document.getElementById("virtual-joystick");
      const crosshair = document.getElementById("crosshair");
      if (!this.isFirstPerson) {
        if (!this.originalCameraPosition) {
          this.originalCameraPosition = this.camera.position.clone();
          this.originalControlsTarget = this.controls.target.clone();
          this.originalCameraFOV = this.camera.fov;
        }
        const currentEuler = new THREE.Euler().setFromQuaternion(this.camera.quaternion, "YXZ");
        this.yaw = currentEuler.y;
        this.pitch = currentEuler.x;
        this.targetYaw = this.yaw;
        this.targetPitch = this.pitch;
        const initialEuler = new THREE.Euler(this.targetPitch, this.targetYaw, 0, "YXZ");
        this.targetQuat = new THREE.Quaternion().setFromEuler(initialEuler);
        this.isFirstPerson = true;
        this.controls.enabled = false;
        this.camera.fov = 75;
        this.camera.updateProjectionMatrix();
        this.camera.position.copy(this.firstPersonStartPosition);
        this.renderer.domElement.requestPointerLock();
        if (crosshair) crosshair.style.display = "block";
        if (joystickElem) joystickElem.style.display = "block";
      } else {
        this.isFirstPerson = false;
        this.camera.fov = this.originalCameraFOV;
        this.camera.updateProjectionMatrix();
        this.camera.position.copy(this.originalCameraPosition);
        this.controls.target.copy(this.originalControlsTarget);
        this.controls.enabled = true;
        if (document.exitPointerLock) {
          document.exitPointerLock();
        }
        if (crosshair) crosshair.style.display = "none";
        if (joystickElem) joystickElem.style.display = "none";
      }
    }
  }
  
  // ----- Main Script -----
  document.addEventListener("DOMContentLoaded", () => {
    const renderContainer = document.getElementById("render-container");
    const modelLoader = new ModelLoader(renderContainer);
  
    const fullscreenBtn = document.getElementById("fullscreen-btn");
    const firstPersonBtn = document.getElementById("first-person-btn");
    const mobileLookBtn = document.getElementById("mobile-look-btn");
  
    firstPersonBtn.addEventListener("click", () => {
      modelLoader.toggleFirstPerson();
    });
  
    mobileLookBtn.addEventListener("click", () => {
      modelLoader.isMobileLookEnabled = !modelLoader.isMobileLookEnabled;
      modelLoader.controls.enabled = !modelLoader.isMobileLookEnabled;
    });
  
    fullscreenBtn.addEventListener("click", () => {
      if (!document.fullscreenElement) {
        if (renderContainer.requestFullscreen) {
          renderContainer.requestFullscreen();
        } else if (renderContainer.mozRequestFullScreen) {
          renderContainer.mozRequestFullScreen();
        } else if (renderContainer.webkitRequestFullscreen) {
          renderContainer.webkitRequestFullscreen();
        } else if (renderContainer.msRequestFullscreen) {
          renderContainer.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.mozCancelFullScreen) {
          document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
          document.msExitFullscreen();
        }
      }
    });
  
    window.addEventListener("resize", () => {
      const width = renderContainer.clientWidth;
      const height = renderContainer.clientHeight;
      modelLoader.camera.aspect = width / height;
      modelLoader.camera.updateProjectionMatrix();
      modelLoader.renderer.setSize(width, height);
    });
  });
  