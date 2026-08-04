uniform sampler2D uDayTexture;
uniform sampler2D uNightTexture;
uniform vec3 uSunDirection;

varying vec3 vWorldNormal;
varying vec3 vWorldPosition;
varying vec2 vUv;

void main() {
  // Normalize the normal and sun direction
  vec3 normal = normalize(vWorldNormal);
  vec3 sunDir = normalize(uSunDirection);
  
  // Calculate the dot product to determine illumination
  float NdotL = dot(normal, sunDir);
  
  // Define twilight zone thresholds
  float dayThreshold = 0.1;
  float nightThreshold = -0.1;
  
  // Calculate blend factor for twilight zone
  float blend;
  if (NdotL > dayThreshold) {
    // Full day
    blend = 1.0;
  } else if (NdotL < nightThreshold) {
    // Full night
    blend = 0.0;
  } else {
    // Twilight zone - smooth transition
    blend = smoothstep(nightThreshold, dayThreshold, NdotL);
  }
  
  // Sample textures
  vec4 dayColor = texture2D(uDayTexture, vUv);
  vec4 nightColor = texture2D(uNightTexture, vUv);
  
  // Blend between day and night textures
  vec3 finalColor = mix(nightColor.rgb, dayColor.rgb, blend);
  
  gl_FragColor = vec4(finalColor, 1.0);
}
