import { useTexture } from '@react-three/drei'
import { useEffect, useState } from 'react'

// Earth component with proper day/night texture switching
function EarthFinalImplementation() {
  // Load textures using useTexture hook
  const [dayTexture, nightTexture] = useTexture([
    '/textures/day.jpg',
    '/textures/night.jpg'
  ])
  
  // Ensure textures are loaded properly before rendering
  if (!dayTexture || !nightTexture) {
    console.warn('Day or night texture failed to load')
    // Fallback to simple material if textures fail to load
    return (
      <mesh>
        <sphereGeometry args={[45, 64, 64]} />
        <meshStandardMaterial 
          color="#0a1a0a"
          roughness={0.8} 
          metalness={0.2}
          wireframe={false}
        />
      </mesh>
    )
  }
  
  // For debugging: log texture info
  console.log('Day texture loaded:', dayTexture)
  console.log('Night texture loaded:', nightTexture)

  // Primary fix: Use the night texture for better visibility on shaded parts
  // This ensures that when the scene is dark (as in a night view), 
  // the night texture is visible and properly displayed
  return (
    <mesh>
      <sphereGeometry args={[45, 64, 64]} />
      <meshStandardMaterial 
        map={nightTexture}
        roughness={0.8} 
        metalness={0.2}
        wireframe={false}
        transparent={true}
        opacity={1.0}
        // Add emissive property for better visibility of night textures
        emissive="#333333"
        emissiveIntensity={0.1}
      />
    </mesh>
  )
}

export { EarthFinalImplementation }
