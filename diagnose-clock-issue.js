// Simple diagnostic script to identify potential THREE.Clock references
const fs = require('fs');
const path = require('path');

console.log('=== Diagnosing THREE.Clock Issue ===\n');

// Function to check a file for Clock references
function checkFileForClockReferences(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    let found = false;
    lines.forEach((line, index) => {
      if (line.includes('THREE.Clock') || 
          line.includes('from.*three.*Clock') || 
          line.includes('import.*Clock.*from')) {
        console.log(`  Found Clock reference in ${filePath}:${index + 1}`);
        console.log(`    ${line.trim()}`);
        found = true;
      }
    });
    
    return found;
  } catch (error) {
    // Silently ignore errors for files that can't be read
    return false;
  }
}

// Walk through the src directory
function walkDir(dir) {
  const results = [];
  
  try {
    const list = fs.readdirSync(dir);
    
    list.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat && stat.isDirectory()) {
        // Recursively check subdirectories
        results.push(...walkDir(filePath));
      } else if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
        // Check TypeScript files for Clock references
        if (checkFileForClockReferences(filePath)) {
          results.push(filePath);
        }
      }
    });
  } catch (error) {
    console.log(`Error reading directory ${dir}:`, error.message);
  }
  
  return results;
}

// Check the src directory
const clockFiles = walkDir('./src');
if (clockFiles.length > 0) {
  console.log('Potential Clock references found in:');
  clockFiles.forEach(file => console.log(`  - ${file}`));
} else {
  console.log('No direct Clock references found in source files.');
}

console.log('\n=== Solution Summary ===');
console.log('1. Created CompleteClockFix replacement in src/utils/fixClockUsage.ts');
console.log('2. Created ThreeClockFix in src/utils/ThreeClockFix.ts'); 
console.log('3. Added proper TypeScript declarations in src/types/three-clock-fix.d.ts');
console.log('4. Created React hooks for time management in src/hooks/useFixedClock.ts');

console.log('\nTo resolve the issue:');
console.log('1. Update any existing THREE.Clock imports to use our fixed implementations');
console.log('2. Rebuild the application');
console.log('3. Test that the error is resolved');

process.exit(0);