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
      this.camera.up.set(0, 1, 0); // always keep up vector
      this.camera.lookAt(0, 0, 0);
  
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
  
      // Save the original camera view when switching modes.
      this.originalCameraPosition = null;
      this.originalControlsTarget = null;
      this.originalCameraFOV = null;
  
      // Configurable offset for first-person start (relative to model center).
      this.firstPersonStartOffset = { x: -1, y: 0.1, z: -1 };
  
      // Will be set once the model is loaded.
      this.firstPersonStartPosition = null;
      // Blue marker for the start position.
      this.firstPersonMarker = null;
  
      // For first-person horizontal look:
      // We'll use a yaw value (in radians) that is updated by mouse movement.
      this.yaw = 0;
      this.lookDistance = 100; // fixed distance to compute the lookAt target
  
      // Create a crosshair overlay.
      this.createCrosshair();
  
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
  
      // Pointer lock: for desktop first-person mode.
      this.onMouseMove = this.onMouseMove.bind(this);
      document.addEventListener("mousemove", this.onMouseMove, false);
      document.addEventListener("pointerlockchange", () => {
        if (document.pointerLockElement !== this.renderer.domElement && this.isFirstPerson) {
          // If pointer lock is lost, exit first-person mode.
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
  
      // Movement boundaries (will be updated when the model is loaded).
      this.sceneBoundaries = {
        min: new THREE.Vector3(),
        max: new THREE.Vector3(),
      };
  
      // Start the render loop.
      this.animate();
  
      // Automatically load the model.
      this.loadModel("./mapa3dsestava.obj", "./mapa3dsestava.mtl");
    }
  
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
      this.renderContainer.style.position = "relative";
      this.renderContainer.appendChild(crosshair);
    }
  
    onMouseMove(event) {
      // When in first-person mode with pointer lock active, update the yaw.
      if (this.isFirstPerson && document.pointerLockElement === this.renderer.domElement) {
        const sensitivity = 0.002; // adjust sensitivity as needed
        this.yaw += event.movementX * sensitivity;
        // Do not change pitch: the camera always remains level.
        // Compute new lookAt target from the current camera position and yaw.
        const lookAt = this.camera.position.clone().add(
          new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(this.lookDistance)
        );
        this.camera.lookAt(lookAt);
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
              // Update scene boundaries and ground level.
              this.sceneBoundaries.min.copy(box.min);
              this.sceneBoundaries.max.copy(box.max);
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
        // Compute keyboard direction relative to the camera.
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
        // Combine joystick and keyboard directions.
        let combinedDir = new THREE.Vector3();
        combinedDir.add(this.firstPersonSettings.direction);
        combinedDir.add(keyboardDir);
        if (combinedDir.length() > 0) combinedDir.normalize();
        const moveVector = combinedDir.multiplyScalar(this.firstPersonSettings.moveSpeed);
        const newPos = this.camera.position.clone().add(moveVector);
        if (this.isWithinSceneBoundaries(newPos.x, newPos.z)) {
          this.camera.position.copy(newPos);
          this.camera.position.y = this.firstPersonSettings.groundLevel + 0.1;
        }
      }
    }
  
    isWithinSceneBoundaries(x, z) {
      if (!this.currentModel) return true;
      const padding = 0.5;
      return (
        x >= this.sceneBoundaries.min.x - padding &&
        x <= this.sceneBoundaries.max.x + padding &&
        z >= this.sceneBoundaries.min.z - padding &&
        z <= this.sceneBoundaries.max.z + padding
      );
    }
  
    updateMobileLook() {
      if (this.isMobileLookEnabled) {
        const alpha = THREE.MathUtils.degToRad(this.deviceOrientation.alpha || 0);
        const beta = THREE.MathUtils.degToRad(this.deviceOrientation.beta || 0);
        const gamma = THREE.MathUtils.degToRad(this.deviceOrientation.gamma || 0);
        let euler = new THREE.Euler(beta, alpha, -gamma, 'YXZ');
        // If in mobile look mode, we only update the yaw (keep pitch = 0)
        euler.x = 0;
        this.camera.quaternion.setFromEuler(euler);
      }
    }
  
    animate() {
      requestAnimationFrame(() => this.animate());
      this.updateFirstPersonMovement();
      this.updateMobileLook();
      if (!this.isFirstPerson && !this.isMobileLookEnabled) {
        this.controls.update();
      }
      this.renderer.render(this.scene, this.camera);
    }
  
    // Toggle first-person mode.
    // When turning on, store the original view, move the camera to the start position,
    // and request pointer lock for immediate mouse look.
    // In first-person mode, the camera remains level (perpendicular to ground);
    // only the look-at target (computed using the stored yaw) changes.
    toggleFirstPerson() {
      if (!this.isFirstPerson) {
        if (!this.originalCameraPosition) {
          this.originalCameraPosition = this.camera.position.clone();
          this.originalControlsTarget = this.controls.target.clone();
          this.originalCameraFOV = this.camera.fov;
        }
        this.isFirstPerson = true;
        this.controls.enabled = false;
        this.camera.fov = 75;
        this.camera.updateProjectionMatrix();
        // Reset yaw to current horizontal direction (assume 0 as default).
        this.yaw = 0;
        // Move the camera to the first-person start position.
        this.camera.position.copy(this.firstPersonStartPosition);
        // Request pointer lock for immediate mouse look.
        this.renderer.domElement.requestPointerLock();
        // Update the lookAt target immediately.
        const lookAt = this.camera.position.clone().add(
          new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(this.lookDistance)
        );
        this.camera.lookAt(lookAt);
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
  