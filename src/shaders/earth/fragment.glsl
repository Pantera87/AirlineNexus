#include <common>

varying vec3 vPosition;
varying vec3 vNormal;

uniform sampler2D uDayTexture;
uniform sampler2D uNightTexture;
uniform sampler2D uSpecularCloudsTexture;

void main() {
    // Normalize normal to prevent grid artifacts
    vec3 normal = normalize(vNormal);

    // Calculate view direction (vector from camera to fragment)
    vec3 viewDirection = normalize(cameraPosition - vPosition);

    // Day / night color
    vec3 dayColor = texture2D(uDayTexture, uv).rgb;
    vec3 nightColor = texture2D(uNightTexture, uv).rgb;

    // Final color (start with day color)
    vec3 color = dayColor;

    gl_FragColor = vec4(color, 1.0);
}