// Cloud Variables Bookmarklet Client
(function() {
  const SERVER_URL = 'http://localhost:3000'; // Your local Flask server
  
  // Extract projectID from Scratch URL
  let projectID;
  try {
    const url = window.location.href;
    const match = url.match(/scratch\.mit\.edu\/projects\/(\d+)/);
    if (!match || !match[1]) throw new Error('Could not extract projectID from URL');
    projectID = match[1];
    console.log(`[CloudVars] Detected projectID: ${projectID}`);
  } catch (error) {
    console.error('[CloudVars] Failed to extract projectID:', error);
    return;
  }
  
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
  
  // Find all cloud variables (starting with 'Cloud')
  function getCloudVariables() {
    return Object.values(stage.variables)
      .filter(v => v.name.startsWith('Cloud'))
      .map(v => ({ id: v.id, name: v.name, value: v.value }));
  }
  
  let cloudVars = getCloudVariables();
  if (!cloudVars.length) {
    console.error('[CloudVars] No variables starting with "Cloud" found! Create at least one.');
    return;
  }
  
  // Track last known values and timestamps
  let lastValues = Object.fromEntries(cloudVars.map(v => [v.name, { value: v.value, timestamp: 0 }]));
  let isInitialized = false;
  
  // Initialize by sending Scratch's cloud variables to server
  async function initializeFromServer() {
    try {
      for (const { name, value } of cloudVars) {
        const response = await fetch(`${SERVER_URL}/api/cloud`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ projectID, name, value, timestamp: lastValues[name].timestamp })
        });
        
        const data = await response.json();
        if (data.success) {
          lastValues[name] = { value: data.newValue, timestamp: data.timestamp };
          console.log(`[CloudVars] Initialized server with ${projectID}/${name}: ${data.newValue} (timestamp: ${data.timestamp})`);
        } else if (data.error.includes('newer value')) {
          console.log(`[CloudVars] Server has newer value for ${projectID}/${name}: ${data.serverValue}`);
          const cloudVar = cloudVars.find(v => v.name === name);
          if (cloudVar) {
            vm.setVariableValue(stage.id, cloudVar.id, data.serverValue);
            lastValues[name] = { value: data.serverValue, timestamp: data.serverTimestamp };
          }
        }
      }
    } catch (error) {
      console.error(`[CloudVars] Failed to initialize to server for project ${projectID}:`, error);
    }
    isInitialized = true;
  }
  
  // Send value to server
  async function sendToServer(name, value, timestamp) {
    try {
      const response = await fetch(`${SERVER_URL}/api/cloud`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ projectID, name, value, timestamp })
      });
      
      const data = await response.json();
      if (data.success) {
        lastValues[name] = { value: data.newValue, timestamp: data.timestamp };
        console.log(`[CloudVars] Sent to server: ${projectID}/${name} = ${value} (timestamp: ${data.timestamp})`);
      } else if (data.error.includes('newer value')) {
        console.log(`[CloudVars] Update rejected for ${projectID}/${name}, fetching server value: ${data.serverValue}`);
        const cloudVar = getCloudVariables().find(v => v.name === name);
        if (cloudVar) {
          vm.setVariableValue(stage.id, cloudVar.id, data.serverValue);
          lastValues[name] = { value: data.serverValue, timestamp: data.serverTimestamp };
        }
      }
    } catch (error) {
      console.error(`[CloudVars] Failed to send ${projectID}/${name} to server:`, error);
    }
  }
  
  // Poll server for remote changes
  async function pollServerForUpdates() {
    if (!isInitialized) return;
    try {
      const response = await fetch(`${SERVER_URL}/api/cloud/all?projectID=${projectID}`);
      const data = await response.json();
      
      if (data.success) {
        for (const [name, { value, timestamp }] of Object.entries(data.variables)) {
          if (lastValues[name] && value !== lastValues[name].value && timestamp > lastValues[name].timestamp) {
            console.log(`[CloudVars] Server ${projectID}/${name} changed: ${lastValues[name].value} -> ${value} (timestamp: ${timestamp})`);
            const cloudVar = getCloudVariables().find(v => v.name === name);
            if (cloudVar) {
              vm.setVariableValue(stage.id, cloudVar.id, value);
              lastValues[name] = { value, timestamp };
            }
          }
        }
      }
    } catch (error) {
      console.error(`[CloudVars] Failed to poll server for project ${projectID}:`, error);
    }
  }
  
  // Monitor for local changes
  function monitor() {
    cloudVars = getCloudVariables();
    if (!cloudVars.length) {
      console.error('[CloudVars] No cloud variables found!');
      return;
    }
    
    for (const { name, value } of cloudVars) {
      if (!lastValues[name]) {
        // New cloud variable detected
        lastValues[name] = { value, timestamp: 0 };
        if (isInitialized) {
          console.log(`[CloudVars] New cloud variable detected: ${projectID}/${name} = ${value}`);
          sendToServer(name, value, lastValues[name].timestamp);
        }
      } else if (isInitialized && value !== lastValues[name].value) {
        console.log(`[CloudVars] ${projectID}/${name} changed locally: ${lastValues[name].value} -> ${value}`);
        sendToServer(name, value, lastValues[name].timestamp);
        lastValues[name].value = value; // Update locally immediately
      }
    }
  }
  
  // Start the system
  console.log(`[CloudVars] Starting cloud variables system for project ${projectID}...`);
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
  
  console.log(`[CloudVars] Cloud variables active for project ${projectID}! Call cloudVarsStop() to stop.`);
})();
