/**
 * Script to verify that the currentScreen state is being persisted correctly
 */

// Check if the Zustand storage exists in localStorage
const storageKey = 'airline-sim-storage';
const storedData = localStorage.getItem(storageKey);

console.log('=== Verification of Page Reload Fix ===\n');

if (!storedData) {
    console.log('❌ No persisted data found in localStorage');
    console.log('   This might be expected if the app has not been used yet.');
} else {
    try {
        const parsedData = JSON.parse(storedData);
        console.log('✅ Persisted data found in localStorage');

        // Check if currentScreen is included
        if (parsedData.state && 'currentScreen' in parsedData.state) {
            console.log(`✅ currentScreen is being persisted: ${parsedData.state.currentScreen}`);
        } else {
            console.log('❌ currentScreen is NOT being persisted');
            console.log('   Available keys:', Object.keys(parsedData.state || {}));
        }

        // Check other important persisted values
        const state = parsedData.state;
        if (state) {
            console.log('\nPersisted state contains:');
            for (const key in state) {
                if (key === 'airline' && state[key]) {
                    console.log(`  - ${key}: [Airline object with ID: ${state[key].id}]`);
                } else if (key === 'currentDate') {
                    console.log(`  - ${key}: ${new Date(state[key]).toISOString()}`);
                } else if (typeof state[key] === 'object') {
                    console.log(`  - ${key}: [Object with ${Object.keys(state[key]).length} properties]`);
                } else {
                    console.log(`  - ${key}: ${state[key]}`);
                }
            }
        }

    } catch (error) {
        console.log('❌ Error parsing stored data:', error.message);
    }
}

console.log('\n=== Test Instructions ===');
console.log('1. Open the application in your browser');
console.log('2. Navigate to different screens (Dashboard, Fleet, Routes, etc.)');
console.log('3. Refresh the page');
console.log('4. Verify you return to the same screen you were on before refresh');
console.log('\nIf this works correctly, the fix is successful! 🎉');