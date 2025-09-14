// Cloud Variables Bookmarklet Client
(function() {
  const SERVER_URL = 'http://localhost:3000'; // Your local Flask server
  
  // Get Scratch VM
  let vm;
  try {
    vm = document.getElementById('app')
      ?._reactRootContainer?._internalRoot?.current?.child
      ?.pendingProps?.store?.getState()?.scratchGui?.vm;
    if (!vm) throw new Error('Scratch VM not found');
  } catch (error) {
    console.error('[CloudVars] Failed to access Scratch VM:', error);
    return;
  }
  
  // Get stage
  const stage = vm.runtime.targets.find(t => t.isStage);
  if (!stage) {
    console.error('[CloudVars] Stage not found!');
    return;
  }
  
  // Find CloudTest variable
  function getCloudTestVariable() {
    return Object.values(stage.variables).find(v => v.name === 'CloudTest');
  }
  
  let cloudTestVar = getCloudTestVariable();
  if (!cloudTestVar) {
    console.error('[CloudVars] CloudTest variable not found! Make sure you have a variable named "CloudTest"');
    return;
  }
  
  let lastValue = cloudTestVar.value;
  let lastTimestamp = 0; // Track server timestamp
  let isInitialized = false;
  
  // Initialize by sending Scratch's value to server
  async function initializeFromServer() {
    try {
      // Send Scratch's current CloudTest value to server
      const response = await fetch(`${SERVER_URL}/api/cloudtest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ value: cloudTestVar.value, timestamp: lastTimestamp })
      });
      
      const data = await response.json();
      if (data.success) {
        lastTimestamp = data.timestamp;
        lastValue = cloudTestVar.value; // Keep Scratch's value
        console.log(`[CloudVars] Initialized server with Scratch CloudTest: ${lastValue} (timestamp: ${lastTimestamp})`);
      } else if (data.error.includes('newer value')) {
        // Server has a newer value; update Scratch
        console.log(`[CloudVars] Server has newer value: ${data.serverValue}`);
        vm.setVariableValue(stage.id, cloudTestVar.id, data.serverValue);
        lastValue = data.serverValue;
        lastTimestamp = data.serverTimestamp;
      }
    } catch (error) {
      console.error('[CloudVars] Failed to initialize to server:', error);
    }
    isInitialized = true;
  }
  
  // Send value to server
  async function sendToServer(value) {
    try {
      const response = await fetch(`${SERVER_URL}/api/cloudtest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ value, timestamp: lastTimestamp })
      });
      
      const data = await response.json();
      if (data.success) {
        lastTimestamp = data.timestamp;
        console.log(`[CloudVars] Sent to server: ${value} (timestamp: ${lastTimestamp})`);
      } else if (data.error.includes('newer value')) {
        // Server rejected update; fetch latest value
        console.log(`[CloudVars] Update rejected, fetching server value: ${data.serverValue}`);
        vm.setVariableValue(stage.id, cloudTestVar.id, data.serverValue);
        lastValue = data.serverValue;
        lastTimestamp = data.serverTimestamp;
      }
    } catch (error) {
      console.error('[CloudVars] Failed to send to server:', error);
    }
  }
  
  // Poll server for remote changes
  async function pollServerForUpdates() {
    if (!isInitialized) return;
    try {
      const response = await fetch(`${SERVER_URL}/api/cloudtest`);
      const data = await response.json();
      
      if (data.success && data.value !== lastValue && data.timestamp > lastTimestamp) {
        console.log(`[CloudVars] Server CloudTest changed: ${lastValue} -> ${data.value} (timestamp: ${data.timestamp})`);
        vm.setVariableValue(stage.id, cloudTestVar.id, data.value);
        lastValue = data.value;
        lastTimestamp = data.timestamp;
      }
    } catch (error) {
      console.error('[CloudVars] Failed to poll server:', error);
    }
  }
  
  // Monitor for local changes
  function monitor() {
    cloudTestVar = getCloudTestVariable();
    if (!cloudTestVar) {
      console.error('[CloudVars] CloudTest variable lost!');
      return;
    }
    
    const currentValue = cloudTestVar.value;
    if (isInitialized && currentValue !== lastValue) {
      console.log(`[CloudVars] CloudTest changed locally: ${lastValue} -> ${currentValue}`);
      sendToServer(currentValue);
      lastValue = currentValue;
    }
  }
  
  // Start the system
  console.log('[CloudVars] Starting cloud variables system...');
  initializeFromServer();
  
  // Monitor local changes every 500ms
  const monitorInterval = setInterval(monitor, 500);
  
  // Poll server for remote changes every 500ms
  const pollInterval = setInterval(pollServerForUpdates, 500);
  
  // Cleanup function
  window.cloudVarsStop = () => {
    clearInterval(monitorInterval);
    clearInterval(pollInterval);
    console.log('[CloudVars] Stopped monitoring');
  };
  
  console.log('[CloudVars] Cloud variables active! Call cloudVarsStop() to stop.');
})();