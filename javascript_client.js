// Cloud Variables Bookmarklet Client - FIXED VERSION
(function() {
  const SERVER_URL = 'https://alternativescratchcloud-production.up.railway.app';
  
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
  
  // Track last known values and pending updates
  let lastValues = Object.fromEntries(cloudVars.map(v => [v.name, { value: v.value }]));
  let pendingUpdates = new Set(); // Track variables currently being updated
  let isInitialized = false;
  let updateQueue = new Map(); // Queue updates to prevent spam
  
  // Debounced update function
  function debounceUpdate(name, value) {
    if (updateQueue.has(name)) {
      clearTimeout(updateQueue.get(name).timeout);
    }
    
    const timeout = setTimeout(() => {
      if (!pendingUpdates.has(name)) {
        sendToServer(name, value);
      }
      updateQueue.delete(name);
    }, 100); // 100ms debounce
    
    updateQueue.set(name, { value, timeout });
  }
  
  // Initialize by sending Scratch's cloud variables to server
  async function initializeFromServer() {
    try {
      for (const { name, value } of cloudVars) {
        pendingUpdates.add(name);
        
        const response = await fetch(`${SERVER_URL}/api/cloud`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectID, name, value })
        });
        
        const data = await response.json();
        if (data.success) {
          lastValues[name] = { value: data.newValue };
          console.log(`[CloudVars] Initialized server with ${projectID}/${name}: ${data.newValue}`);
        } else {
          console.log(`[CloudVars] Server rejected initialization for ${projectID}/${name}: ${data.error}`);
          const cloudVar = cloudVars.find(v => v.name === name);
          if (cloudVar && data.serverValue) {
            vm.setVariableValue(stage.id, cloudVar.id, data.serverValue);
            lastValues[name] = { value: data.serverValue };
          }
        }
        
        pendingUpdates.delete(name);
      }
    } catch (error) {
      console.error(`[CloudVars] Failed to initialize to server for project ${projectID}:`, error);
      pendingUpdates.clear();
    }
    isInitialized = true;
  }
  
  // Send value to server
  async function sendToServer(name, value) {
    if (pendingUpdates.has(name)) {
      console.log(`[CloudVars] Skipping ${name} - update already in progress`);
      return;
    }
    
    pendingUpdates.add(name);
    
    try {
      console.log(`[CloudVars] Sending to server: ${projectID}/${name} = ${value}`);
      
      const response = await fetch(`${SERVER_URL}/api/cloud`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectID, name, value: String(value) })
      });
      
      const data = await response.json();
      if (data.success) {
        lastValues[name] = { value: data.newValue };
        console.log(`[CloudVars] Server confirmed: ${projectID}/${name} = ${data.newValue}`);
      } else {
        console.log(`[CloudVars] Update rejected for ${projectID}/${name}: ${data.error}`);
        const cloudVar = getCloudVariables().find(v => v.name === name);
        if (cloudVar && data.serverValue) {
          vm.setVariableValue(stage.id, cloudVar.id, data.serverValue);
          lastValues[name] = { value: data.serverValue };
        }
      }
    } catch (error) {
      console.error(`[CloudVars] Failed to send ${projectID}/${name} to server:`, error);
    } finally {
      pendingUpdates.delete(name);
    }
  }
  
  // ✅ Monitor for local changes (patched)
  function monitor() {
    cloudVars = getCloudVariables();
    if (!cloudVars.length) {
      console.error('[CloudVars] No cloud variables found!');
      return;
    }
    
    for (const { name, value } of cloudVars) {
      if (pendingUpdates.has(name)) continue;

      if (!lastValues[name]) {
        lastValues[name] = { value };
        if (isInitialized) {
          console.log(`[CloudVars] New cloud variable detected: ${projectID}/${name} = ${value}`);
          debounceUpdate(name, value);
        }
      } else if (isInitialized && value !== lastValues[name].value) {
        console.log(`[CloudVars] ${projectID}/${name} changed locally: ${lastValues[name].value} -> ${value}`);

        // Tentatively update immediately
        lastValues[name] = { value };

        // Then send update
        debounceUpdate(name, value);
      }
    }
  }
  
  // ✅ Poll server for remote changes (patched)
  async function pollServerForUpdates() {
    if (!isInitialized) return;
    
    try {
      const response = await fetch(`${SERVER_URL}/api/cloud/all?projectID=${projectID}`);
      const data = await response.json();
      
      if (data.success) {
        for (const [name, { value }] of Object.entries(data.variables)) {
          if (pendingUpdates.has(name)) continue;
          
          const cloudVar = getCloudVariables().find(v => v.name === name);
          if (cloudVar && cloudVar.value !== value) {
            console.log(`[CloudVars] Server ${projectID}/${name} changed: ${cloudVar.value} -> ${value}`);
            vm.setVariableValue(stage.id, cloudVar.id, value);
            lastValues[name] = { value };
          }
        }
      }
    } catch (error) {
      console.error(`[CloudVars] Failed to poll server for project ${projectID}:`, error);
    }
  }
  
  // Start the system
  console.log(`[CloudVars] Starting cloud variables system for project ${projectID}...`);
  initializeFromServer();
  
  const monitorInterval = setInterval(monitor, 200);
  const pollInterval = setInterval(pollServerForUpdates, 1000);
  
  // Cleanup function
  window.cloudVarsStop = () => {
    clearInterval(monitorInterval);
    clearInterval(pollInterval);
    updateQueue.forEach(({ timeout }) => clearTimeout(timeout));
    updateQueue.clear();
    pendingUpdates.clear();
    console.log('[CloudVars] Stopped monitoring');
  };
  
  console.log(`[CloudVars] Cloud variables active for project ${projectID}! Call cloudVarsStop() to stop.`);
})();
