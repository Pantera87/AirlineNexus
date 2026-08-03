import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

export function WorldViewTest() {
  const containerRef = useRef<HTMLDivElement>(null);
  const guiRef = useRef<any>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();

    // Camera setup
    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 2;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(
      containerRef.current.clientWidth,
      containerRef.current.clientHeight
    );
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);

    // Load textures
    const textureLoader = new THREE.TextureLoader();
    const dayTexture = textureLoader.load('/textures/day.jpg');
    const nightTexture = textureLoader.load('/textures/night.jpg');
    const specularCloudsTexture = textureLoader.load('/textures/specularClouds.jpg');

    // Set color space for sRGB textures
    dayTexture.colorSpace = THREE.SRGBColorSpace;
    nightTexture.colorSpace = THREE.SRGBColorSpace;

    // Create Earth geometry (highly subdivided sphere)
    const earthGeometry = new THREE.SphereGeometry(1, 64, 64);

    // Custom shader material for Earth with atmosphere and lighting
    const earthMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uDayTexture: { value: dayTexture },
        uNightTexture: { value: nightTexture },
        uSpecularCloudsTexture: { value: specularCloudsTexture },
        uAtmosphereDayColor: { value: new THREE.Color(0x5599ff) },
        uAtmosphereTwilightColor: { value: new THREE.Color(0xff6600) },
        uRoughnessLow: { value: 0.3 },
        uRoughnessHigh: { value: 1.0 },
        uSunPosition: { value: new THREE.Vector3() },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vNormal;

        void main() {
          vUv = uv;
          vPosition = position;
          vNormal = normalize(normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uDayTexture;
        uniform sampler2D uNightTexture;
        uniform sampler2D uSpecularCloudsTexture;
        uniform vec3 uAtmosphereDayColor;
        uniform vec3 uAtmosphereTwilightColor;
        uniform float uRoughnessLow;
        uniform float uRoughnessHigh;
        uniform vec3 uSunPosition;

        varying vec2 vUv;
        varying vec3 vPosition;
        varying vec3 vNormal;

        void main() {
          // Day/night color based on lighting
          vec3 dayColor = texture(uDayTexture, vUv).rgb;
          vec3 nightColor = texture(uNightTexture, vUv).rgb;

          // Calculate lighting - dot product between normal and light direction (in object space)
          float lightIntensity = max(dot(normalize(vNormal), normalize(uSunPosition)), 0.0);

          // Blend textures based on lighting with smooth transition
          float mixAmount = smoothstep(0.1, 0.3, lightIntensity);
          vec3 color = mix(nightColor, dayColor, mixAmount);

          // Atmosphere glow
          float atmosphere = smoothstep(uRoughnessLow, uRoughnessHigh, abs(vNormal.y));
          vec3 atmosphereColor = mix(uAtmosphereTwilightColor, uAtmosphereDayColor, vNormal.y + 0.5);
          color += atmosphere * atmosphereColor * 0.2;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    // Create Earth mesh
    const earth = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earth);

    // Add ambient light (reduced)
    const ambientLight = new THREE.AmbientLight(0x222222, 1);
    scene.add(ambientLight);

    // Add directional light (sun) - positioned far away to simulate sunlight
    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
    sunLight.position.set(10, 5, 7); // Positioned to illuminate half the globe

    // Update shader with sun position in world space
    earthMaterial.uniforms.uSunPosition.value = sunLight.position.clone();
    scene.add(sunLight);


    // Orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);

      // Rotate Earth around its own axis (much slower)
      earth.rotation.y += 0.0005;

      // Keep sun stationary in space while Earth rotates
      // The lighting will rotate with the globe as it gets illuminated by the fixed sun
      if (earthMaterial.uniforms.uSunPosition) {
        earthMaterial.uniforms.uSunPosition.value = sunLight.position.clone();
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!containerRef.current) return;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white mb-4">World View Test - Earth Shaders</h1>
      <p className="text-runway-300 mb-6">
        Testing new Three.js earth shader implementation with atmosphere effects.
      </p>

      <div className="bg-runway-800/50 rounded-lg p-4 mb-4">
        <h2 className="text-lg font-medium text-white mb-3">Features:</h2>
        <ul className="text-runway-300 space-y-1">
          <li>• Interactive 3D Earth with day/night textures</li>
          <li>• Custom GLSL shaders for realistic rendering</li>
          <li>• Atmosphere glow effects (day and twilight colors)</li>
          <li>• Orbit controls for navigation</li>
          <li>• Stationary sun - Earth rotates, shading follows illumination</li>
        </ul>
      </div>

      <div className="bg-runway-900 rounded-lg p-4 mb-6">
        <h2 className="text-lg font-medium text-white mb-3">Controls:</h2>
        <ul className="text-runway-300 space-y-1">
          <li>• Left-click and drag to rotate</li>
          <li>• Right-click and drag to pan</li>
          <li>• Scroll to zoom in/out</li>
        </ul>
      </div>

      <div
        ref={containerRef}
        className="w-full h-96 bg-runway-800 rounded-lg border border-white/10"
      />
    </div>
  );
}
