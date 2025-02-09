// Assumes that THREE, THREE.OBJLoader, THREE.MTLLoader, THREE.PointerLockControls, 
// THREE.OrbitControls, and nipplejs are already loaded.

class ModelLoader {
    constructor(renderContainer) {
      this.renderContainer = renderContainer;
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0xe0e0e0);
  
      // Setup camera (we’ll update its position once the model is loaded)
      this.camera = new THREE.PerspectiveCamera(
        50,
        renderContainer.clientWidth / renderContainer.clientHeight,
        0.1,
        1000
      );
      this.camera.position.set(0, 0, 0);
      this.camera.lookAt(0, 0, 0);
  
      // Setup renderer
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
      this.renderer.setSize(renderContainer.clientWidth, renderContainer.clientHeight);
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderContainer.appendChild(this.renderer.domElement);
  
      // Add floor and lights
      this.createInfiniteFloor();
      this.addLights();
  
      // Setup OrbitControls (default navigation mode)
      this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.25;
      this.controls.target.set(0, 0, 0);
      this.controls.update();
  
      // First-person (walking) settings – we’ll use pointer lock for look‑around.
      this.isFirstPerson = false;
      this.firstPersonSettings = {
        moveSpeed: 0.02,
        direction: new THREE.Vector3(),
        groundLevel: 0,
      };
      this.pointerLockControls = null;
      this.initPointerLock();
  
      // Mobile device orientation (for mobile look mode)
      this.isMobileLookEnabled = false;
      this.deviceOrientation = { alpha: 0, beta: 0, gamma: 0 };
      window.addEventListener(
        "deviceorientation",
        (event) => {
          if (this.isMobileLookEnabled && !this.isFirstPerson) {
            this.deviceOrientation.alpha = event.alpha;
            this.deviceOrientation.beta = event.beta;
            this.deviceOrientation.gamma = event.gamma;
          }
        },
        true
      );
  
      // Setup raycaster for part selection
      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();
      this.setupPartSelection();
  
      // Setup virtual joystick for movement (if an element with id "virtual-joystick" exists)
      this.setupVirtualJoystick();
  
      // Movement boundaries (updated when a model is loaded)
      this.sceneBoundaries = {
        min: new THREE.Vector3(),
        max: new THREE.Vector3(),
      };
  
      // Start the render loop
      this.animate();
  
      // Automatically load the model (adjust the paths as needed)
      this.loadModel("./mapa3dsestava.obj", "./mapa3dsestava.mtl");
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
  
    // ----- Pointer Lock Setup for First-Person Look-Around -----
    initPointerLock() {
        const havePL = "pointerLockElement" in document ||
                       "mozPointerLockElement" in document ||
                       "webkitPointerLockElement" in document;
        if (havePL) {
          document.addEventListener(
            "pointerlockchange",
            this.onPointerLockChange.bind(this),
            false
          );
          document.addEventListener(
            "mozpointerlockchange",
            this.onPointerLockChange.bind(this),
            false
          );
          document.addEventListener(
            "webkitpointerlockchange",
            this.onPointerLockChange.bind(this),
            false
          );
        }
      }
      
      onPointerLockChange() {
        const canvas = this.renderer.domElement;
        const locked =
          document.pointerLockElement === canvas ||
          document.mozPointerLockElement === canvas ||
          document.webkitPointerLockElement === canvas;
        if (this.pointerLockControls) {
          this.pointerLockControls.enabled = locked;
        }
      }
      
  
    onPointerLockChange() {
      const canvas = this.renderer.domElement;
      const locked =
        document.pointerLockElement === canvas ||
        document.mozPointerLockElement === canvas ||
        document.webkitPointerLockElement === canvas;
      if (this.pointerLockControls) {
        this.pointerLockControls.enabled = locked;
      }
    }
  
    enablePointerLock() {
        const canvas = this.renderer.domElement;
        canvas.requestPointerLock =
          canvas.requestPointerLock ||
          canvas.mozRequestPointerLock ||
          canvas.webkitRequestPointerLock;
        if (canvas.requestPointerLock) {
          canvas.requestPointerLock();
        }
      }
      
      disablePointerLock() {
        document.exitPointerLock =
          document.exitPointerLock ||
          document.mozExitPointerLock ||
          document.webkitExitPointerLock;
        if (document.exitPointerLock) {
          document.exitPointerLock();
        }
      }
      
 
    // -----------------------------------------------------------
  
    setupVirtualJoystick() {
      const joystickContainer = document.getElementById("virtual-joystick");
      if (!joystickContainer) return;
      this.joystick = nipplejs.create({
        zone: joystickContainer,
        mode: "static",
        position: { left: "50%", top: "50%" },
        color: "rgba(100,100,100,0.5)",
        size: 80,
      });
      this.joystick.on("move", (evt, data) => {
        if (this.isFirstPerson) {
          console.log("Joystick move event fired", data);
          // Your movement calculations...
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
      // Listen for clicks on the container to perform raycasting
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
      // Reset any previous highlight
      if (this.previousHighlight) {
        this.previousHighlight.material.color.set(this.previousColor);
      }
      this.previousHighlight = object;
      this.previousColor = object.material.color.clone();
      object.material.color.set(0xff0000);
    }
  
    loadModel(objPath, mtlPath) {
      // Remove any existing model
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
              // Center and scale the model
                        // Scale the model so that its largest dimension is 5
                let box = new THREE.Box3().setFromObject(object);
                const size = box.getSize(new THREE.Vector3());
                const maxDim = Math.max(size.x, size.y, size.z);
                const scaleFactor = 5 / maxDim;
                object.scale.set(scaleFactor, scaleFactor, scaleFactor);

                // Recompute bounding box after scaling
                box = new THREE.Box3().setFromObject(object);
                const center = box.getCenter(new THREE.Vector3());

                // Set the position so that the model is centered horizontally (x and z)
                // and its lowest point (box.min.y) is aligned with y = 0.
                object.position.set(-center.x, -box.min.y, -center.z);

                // Update scene boundaries and the ground level (if needed)
                this.sceneBoundaries.min.copy(box.min);
                this.sceneBoundaries.max.copy(box.max);
                this.firstPersonSettings.groundLevel = 0;  // now the model sits on y=0

              this.scene.add(object);
              this.fitCameraToObject();
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
      const fov = this.camera.fov * (Math.PI / 180);
      const cameraDistance = Math.abs(maxDim / (2 * Math.tan(fov / 2))) * 2;
      // Position the camera so that the model is in view
      this.camera.position.copy(center);
      this.camera.position.y += maxDim / 2;
      this.camera.position.z += cameraDistance;
      this.camera.lookAt(center);
      this.controls.target.copy(center);
      this.controls.update();
    }
  
    updateFirstPersonMovement() {
      if (this.isFirstPerson && this.currentModel) {
        const floorLevel = this.firstPersonSettings.groundLevel;
        const moveVector = this.firstPersonSettings.direction
          .clone()
          .multiplyScalar(this.firstPersonSettings.moveSpeed);
        const newPos = this.camera.position.clone().add(moveVector);
        if (this.isWithinSceneBoundaries(newPos.x, newPos.z)) {
          this.camera.position.x = newPos.x;
          this.camera.position.z = newPos.z;
          this.camera.position.y = floorLevel + 0.1;
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
      if (this.isMobileLookEnabled && !this.isFirstPerson) {
        this.camera.rotation.x = THREE.MathUtils.degToRad(this.deviceOrientation.beta);
        this.camera.rotation.y = THREE.MathUtils.degToRad(-this.deviceOrientation.gamma);
        this.camera.rotation.z = THREE.MathUtils.degToRad(this.deviceOrientation.alpha);
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
  
    // Toggle first-person mode: disable orbit controls, change FOV, and enable pointer lock.
    toggleFirstPerson() {
        this.isFirstPerson = !this.isFirstPerson;
        if (this.isFirstPerson) {
          this.controls.enabled = false;
          this.camera.fov = 75;
          this.camera.updateProjectionMatrix();
          if (!this.pointerLockControls) {
            // Ensure you have imported or loaded THREE.PointerLockControls correctly.
            this.pointerLockControls = new THREE.PointerLockControls(
              this.camera,
              this.renderer.domElement
            );
          }
          this.enablePointerLock();
          // Optionally, set a starting position for first-person mode.
          if (this.currentModel) {
            const box = new THREE.Box3().setFromObject(this.currentModel);
            const center = box.getCenter(new THREE.Vector3());
            this.camera.position.set(
              center.x,
              this.firstPersonSettings.groundLevel + 0.05,
              center.z + 1
            );
            this.camera.lookAt(
              new THREE.Vector3(center.x, this.firstPersonSettings.groundLevel + 0.05, center.z - 5)
            );
          }
        } else {
          this.camera.fov = 50;
          this.camera.updateProjectionMatrix();
          this.controls.enabled = true;
          this.disablePointerLock();
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
      // Disable OrbitControls when using mobile look mode
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
  