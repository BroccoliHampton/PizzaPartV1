// js/scene.js

// --- Private Module Variables ---
let scene, camera, renderer, donutGroup, glazeMaterial, donutMaterial, sprinkleMeshes = [];
let pepperoniMaterial; // For the pepperoni
let isDragging = false;
let previousPointerX = 0;
let previousPointerY = 0;
let initialPinchDistance = 0;
let currentCameraZ = 10;
let isThreeJSInitialized = false; 
let donutSpinSpeed = 0.005;

let composer;
let inversionPass;
let clock = new THREE.Clock();

const NegativeShader = {
    uniforms: {
        "tDiffuse": { value: null },
        "time":     { value: 0.0 }
    },
    vertexShader: [
        "varying vec2 vUv;",
        "void main() {",
            "vUv = uv;",
            "gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );",
        "}"
    ].join( "\n" ),
    fragmentShader: [
        "uniform float time;",
        "uniform sampler2D tDiffuse;",
        "varying vec2 vUv;",
        "void main() {",
            "vec4 texel = texture2D( tDiffuse, vUv );",
            "vec3 inverted = vec3(1.0 - texel.r, 1.0 - texel.g, 1.0 - texel.b);",
            "float t = sin(time * 0.5) * 0.05 + 0.05;",
            "inverted.r = inverted.r * (1.0 - t * 0.5);",
            "inverted.g = inverted.g + t;",
            "inverted.b = inverted.b * (1.0 - t * 0.8);",
            "float contrast = 1.3;",
            "inverted = (inverted - 0.5) * contrast + 0.5;",
            "gl_FragColor = vec4(inverted, texel.a);",
        "}"
    ].join( "\n" )
};

const MIN_ZOOM_Z = 3;
const MAX_ZOOM_Z = 20;

const glazeColors = [ // Cheese colors
    0xFFD700, // Yellow
    0xFFA500, // Orange
    0xFFF8DC, // Pale
    0xFFE4B5  // Moccasin
];
let currentGlazeColorIndex = 0;

const donutBaseColors = [ // Crust colors
    0x5C3317, // Dark
    0xDEB887, // Standard
    0x3D2B1F, // Darker
    0xF5DEB3, // Light
    0x8B4513, // Saddle Brown
    null // Wireframe
];
let currentDonutBaseColorIndex = 0;

// Replaced sprinkle colors with pepperoni/topping colors
const pepperoniColors = [
    0xBC4A3C, // Red
    0x8B0000, // Darker Red
    0xCCCCCC, // Mushroom
    0x006400  // Green Pepper
];
let currentPepperoniColorIndex = 0;


// --- Private Functions ---

function createCrackTexture(size = 1024) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < 15; i++) {
        ctx.beginPath();
        let startX = Math.random() * size;
        let startY = Math.random() * size;
        ctx.moveTo(startX, startY);
        let len = Math.random() * 60 + 30;
        let currentX = startX;
        let currentY = startY;
        for (let j = 0; j < 5; j++) {
             currentX += (Math.random() - 0.5) * len;
             currentY += (Math.random() - 0.5) * len;
             currentX = Math.max(0, Math.min(size, currentX));
             currentY = Math.max(0, Math.min(size, currentY));
            ctx.lineTo(currentX, currentY);
            len *= 0.8;
        }
        ctx.stroke();
    }
    return new THREE.CanvasTexture(canvas);
}

function createSpeckleTexture(size = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF'; 
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 2000; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = Math.random() * 0.8 + 0.4;
        const alpha = Math.random() * 0.5 + 0.3;
        const shade = Math.floor(Math.random() * 40);
        ctx.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${alpha})`; 
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    return new THREE.CanvasTexture(canvas);
}

// This function now creates pepperonis
function createSprinkles() {
    sprinkleMeshes.forEach(sprinkle => donutGroup.remove(sprinkle));
    sprinkleMeshes = [];

    const pepperoniGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.05, 16);
    pepperoniMaterial = new THREE.MeshStandardMaterial({ 
        color: pepperoniColors[currentPepperoniColorIndex] 
    });

    const positions = [
        [1.5, 0.5],
        [1.8, -0.2],
        [2.5, 0.8],
        [2.2, -0.9],
        [2.8, 0]
    ];

    positions.forEach(pos => {
        // Simple check to place pepperoni within the slice bounds
        const angle = Math.atan2(pos[1], pos[0]);
        const distance = Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1]);
        if (distance < 3.2 && angle > -Math.PI / 7 && angle < Math.PI / 7) {
            const pepperoni = new THREE.Mesh(pepperoniGeometry, pepperoniMaterial);
            // Position on top of the slice (0.2 is slice depth)
            pepperoni.position.set(pos[0], pos[1], 0.2 + 0.025); 
            donutGroup.add(pepperoni);
            sprinkleMeshes.push(pepperoni);
        }
    });
}

function onResize(dom) {
    if (renderer && camera && dom.glazery.rainContainer) {
        const container = dom.glazery.rainContainer;
        const w = container.clientWidth;
        const h = container.clientHeight;
        if (w > 0 && h > 0) {
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
            if (composer) {
                composer.setSize(w, h);
            }
        }
    }
}

let pointers = [];

function getPinchDistance(e) {
    if (e.touches && e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }
    return 0;
}

function onPointerDown(e) {
    pointers.push(e);
    if (pointers.length === 1) {
        isDragging = true;
        previousPointerX = e.clientX;
        previousPointerY = e.clientY;
    }
    e.target.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
    const index = pointers.findIndex(p => p.pointerId === e.pointerId);
    if (index > -1) {
        pointers[index] = e;
    }

    if (pointers.length === 2 && initialPinchDistance > 0) {
        const currentPinchDistance = getPinchDistance(e);
        if (currentPinchDistance === 0) return;
        
        const zoomFactor = initialPinchDistance / currentPinchDistance;
        let newZ = currentCameraZ * zoomFactor;
        
        newZ = Math.max(MIN_ZOOM_Z, Math.min(MAX_ZOOM_Z, newZ));
        camera.position.z = newZ;
        camera.updateProjectionMatrix();
        // This is the only DOM element the scene module needs to know about.
        document.getElementById('glazery-zoom-slider').value = newZ;

        initialPinchDistance = currentPinchDistance;
        currentCameraZ = newZ;

    }
    if (isDragging && pointers.length === 1) { 
        const deltaX = e.clientX - previousPointerX;
        const deltaY = e.clientY - previousPointerY;
        
        donutGroup.rotation.y += deltaX * 0.01;
        donutGroup.rotation.x += deltaY * 0.01;
        
        previousPointerX = e.clientX;
        previousPointerY = e.clientY;
    }
}

function onPointerUp(e) {
    pointers = pointers.filter(p => p.pointerId !== e.pointerId);
    e.target.releasePointerCapture(e.pointerId);

    if (isDragging && pointers.length === 0) {
        isDragging = false;
    }

    if (pointers.length < 2) {
        initialPinchDistance = 0;
    }
}

function onMouseWheel(e) {
    e.preventDefault();
    let newZ = currentCameraZ + e.deltaY * 0.02;
    newZ = Math.max(MIN_ZOOM_Z, Math.min(MAX_ZOOM_Z, newZ));
    camera.position.z = newZ;
    camera.updateProjectionMatrix();
    // This is the only DOM element the scene module needs to know about.
    document.getElementById('glazery-zoom-slider').value = newZ;
    currentCameraZ = newZ;
}

// --- Exported Functions ---

/**
 * Initializes the Three.js scene, camera, renderer, and pizza.
 * @param {object} dom - The cached DOM elements object.
 */
export function initThreeJS(dom) {
    if (isThreeJSInitialized) return; 
    
    scene = new THREE.Scene();
    
    const container = dom.glazery.rainContainer;
    if (!container) return;
    const w = container.clientWidth || 300;
    const h = container.clientHeight || 300;

    camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1000);
    camera.position.z = currentCameraZ;

    if (!dom.glazery.canvas) return;
    renderer = new THREE.WebGLRenderer({ 
        canvas: dom.glazery.canvas,
        alpha: true
    });
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio);

    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));

    inversionPass = new THREE.ShaderPass(NegativeShader);
    composer.addPass(inversionPass);
    composer.enabled = false;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7); 
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    donutGroup = new THREE.Group();
    
    // --- Pizza Slice Base (Cheese/Sauce) ---
    const pizzaShape = new THREE.Shape();
    const radius = 3.5;
    const startAngle = -Math.PI / 7; // A reasonable slice angle
    const endAngle = Math.PI / 7;

    // Start at the point
    pizzaShape.moveTo(0, 0);
    // Arc for the crust edge
    pizzaShape.absarc(0, 0, radius, startAngle, endAngle, false);
    // Line back to the point
    pizzaShape.lineTo(0, 0);

    const extrudeSettings = {
        steps: 1,
        depth: 0.2, // Thickness of the slice
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.05,
        bevelOffset: 0,
        bevelSegments: 1
    };

    const pizzaGeometry = new THREE.ExtrudeGeometry(pizzaShape, extrudeSettings);

    // This material was the 'glaze' material. Let's use it for the cheese.
    glazeMaterial = new THREE.MeshStandardMaterial({
        color: glazeColors[currentGlazeColorIndex],
        roughness: 0.7,
        metalness: 0.1,
    });
    const pizzaBase = new THREE.Mesh(pizzaGeometry, glazeMaterial);
    donutGroup.add(pizzaBase);


    // --- Pizza Crust ---
    const crustPath = new THREE.Path();
    // This arc must match the pizzaShape's arc
    crustPath.absarc(0, 0, radius, startAngle, endAngle, false);

    const crustGeometry = new THREE.TubeGeometry(
        crustPath,
        20,    // path segments
        0.3,   // radius of the tube
        8,     // tube segments
        false  // closed
    );
    
    // This was the 'donut' material. Let's use it for the crust.
    const crackTexture = createCrackTexture(1024);
    crackTexture.wrapS = crackTexture.wrapT = THREE.RepeatWrapping;
    crackTexture.repeat.set(1, 1);
    
    const speckleTexture = createSpeckleTexture(512);
    speckleTexture.wrapS = speckleTexture.wrapT = THREE.RepeatWrapping;
    speckleTexture.repeat.set(3, 3);

    donutMaterial = new THREE.MeshStandardMaterial({
        color: donutBaseColors[currentDonutBaseColorIndex],
        roughness: 0.8,
        metalness: 0.05,
        map: speckleTexture,
        bumpMap: crackTexture,
        bumpScale: 0.08
    });
    const pizzaCrust = new THREE.Mesh(crustGeometry, donutMaterial);
    // Position the crust to sit on top of the slice edge
    pizzaCrust.position.z = 0.2; // Lift it to be on top of the base
    donutGroup.add(pizzaCrust);

    // This will now create pepperonis
    createSprinkles();
    
    scene.add(donutGroup);

    // Add scene-specific listeners
    dom.glazery.canvas.addEventListener('pointerdown', onPointerDown);
    dom.glazery.canvas.addEventListener('pointermove', onPointerMove);
    dom.glazery.canvas.addEventListener('pointerup', onPointerUp);
    dom.glazery.canvas.addEventListener('pointerleave', onPointerUp);
    dom.glazery.canvas.addEventListener('wheel', onMouseWheel, { passive: false });
    
    dom.glazery.zoomSlider.min = MIN_ZOOM_Z;
    dom.glazery.zoomSlider.max = MAX_ZOOM_Z;
    dom.glazery.zoomSlider.value = currentCameraZ;
    dom.glazery.zoomSlider.step = 0.1;
    dom.glazery.zoomSlider.oninput = () => {
        if (!isThreeJSInitialized) return;
        const newZ = parseFloat(dom.glazery.zoomSlider.value);
        camera.position.z = newZ;
        camera.updateProjectionMatrix();
        currentCameraZ = newZ;
    };

    window.addEventListener('resize', () => onResize(dom));

    isThreeJSInitialized = true; 
}

/**
 * The main animation loop.
 */
export function animate() {
    requestAnimationFrame(animate);
    
    if (donutGroup && renderer) {
        donutGroup.rotation.y += donutSpinSpeed; 
        
        if (donutSpinSpeed > 0.005) {
            donutSpinSpeed *= 0.95;
            if (donutSpinSpeed < 0.006) {
                donutSpinSpeed = 0.005;
            }
        }
        
        try {
            if (composer && composer.enabled) {
                inversionPass.uniforms[ 'time' ].value = clock.getElapsedTime();
                composer.render();
            } else {
                renderer.render(scene, camera);
            }
        } catch (e) {
            console.error('[Render Error] Animation frame failed:', e.message);
        }
    }
}

/**
 * Changes the color of the pizza's cheese.
 */
export function changeGlazeColor() {
    if (glazeMaterial) {
        currentGlazeColorIndex = (currentGlazeColorIndex + 1) % glazeColors.length;
        glazeMaterial.color.set(glazeColors[currentGlazeColorIndex]);
    }
}

/**
 * Changes the color/wireframe of the pizza crust.
 */
export function changeDonutBaseColor() {
    if (donutMaterial) {
        currentDonutBaseColorIndex = (currentDonutBaseColorIndex + 1) % donutBaseColors.length;
        const newColorOrMode = donutBaseColors[currentDonutBaseColorIndex];

        if (newColorOrMode === null) {
            donutMaterial.wireframe = true;
            donutMaterial.color.set(0xF5E6C1); 
        } else {
            donutMaterial.wireframe = false;
            donutMaterial.color.set(newColorOrMode);
        }
    }
}

/**
 * Changes the color of the pepperoni/toppings.
 */
export function changeSprinkleColor() {
    if (pepperoniMaterial) {
        currentPepperoniColorIndex = (currentPepperoniColorIndex + 1) % pepperoniColors.length;
        pepperoniMaterial.color.set(pepperoniColors[currentPepperoniColorIndex]);
    }
}

/**
 * Sets the spin speed of the pizza.
 * @param {number} speed - The new spin speed.
 */
export function setDonutSpinSpeed(speed) {
    donutSpinSpeed = speed;
}

/**
 * Returns the post-processing composer object.
 * @returns {THREE.EffectComposer} The composer.
 */
export function getComposer() {
    return composer;
}
