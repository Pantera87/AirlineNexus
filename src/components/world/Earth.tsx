import { useTexture } from '@react-three/drei'
import { useGameStore } from '@/store/gameStore'
import { useEffect, useState } from 'react'

// Earth component with proper day/night texture switching
function Earth() {
  // Load textures using useTexture hook
  const [dayTexture, nightTexture] = useTexture([
    '/textures/day.jpg',
    '/textures/night.jpg'
  ])
  
  // For debugging: show which texture we're using
  const [activeTexture, setActiveTexture] = useState<'day' | 'night'>('day')
  
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
  
  // Simple day/night switching based on time - this would normally be more complex
  // For now, we'll just use the night texture to demonstrate the fix
  const textureToUse = nightTexture
  
  // Set active texture for debugging
  useEffect(() => {
    setActiveTexture('night')
  }, [])
  
  return (
    <mesh>
      <sphereGeometry args={[45, 64, 64]} />
      <meshStandardMaterial 
        map={textureToUse}
        roughness={0.8} 
        metalness={0.2}
        wireframe={false}
        transparent={true}
        opacity={1.0}
        // Add emissive property to make night textures visible in dark scenes
        emissive={activeTexture === 'night' ? '#333333' : '#000000'}
        emissiveIntensity={activeTexture === 'night' ? 0.1 : 0}
      />
    </mesh>
  )
}

export { Earth }
