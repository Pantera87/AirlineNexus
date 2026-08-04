uniform float uTime;

varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec2 vUv;

void main() {
  vUv = uv;
  
  // Transform position to world space
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  
  // Transform normal to world space
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
