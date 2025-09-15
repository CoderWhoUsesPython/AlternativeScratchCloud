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

  // Helper: get all cloud variables (starting with 'Cloud')
  function getCloudVariables() {
    return Object.values(stage.variables)
      .filter(v => v.name.startsWith('Cloud'))
      .map(v => ({ id: v.id, name: v.name, value: v.value }));
  }

  let cloudVars = getCloudVariables();
  if (!cloudVars.length) {
    console.error('[CloudVars] No variables starting with "Cloud" found!');
    return;
  }

  // Track last known values & timestamps
  let lastValues = Object.fromEntries(cloudVars.map(v => [v.name, { value: v.value, timestamp: 0 }]));
  let pendingUpdates = new Set();
  let isInitialized = false;
  let updateQueue = new Map();

  // Debounce function
  function debounceUpdate(name, value) {
    if (updateQueue.has(name)) clearTimeout(updateQueue.get(name).timeout);
    const timeout = setTimeout(() => {
      if (!pendingUpdates.has(name)) sendToServer(name, value);
      updateQueue.delete(name);
    }, 100);
    updateQueue.set(name, { value, timeout });
  }

  // Send value to server
  async function sendToServer(name, value) {
    if (pendingUpdates.has(name)) return;
    pendingUpdates.add(name);

    try {
      const response = await fetch(`${SERVER_URL}/api/cloud`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectID, name, value: String(value) })
      });
      const data = await response.json();
      if (data.success) {
        lastValues[name] = { value: data.newValue, timestamp: new Date(data.lastModified) };
        console.log(`[CloudVars] Server confirmed: ${name} = ${data.newValue}`);
      } else {
        console.warn(`[CloudVars] Update rejected: ${name}`, data.error);
        if (data.serverValue) {
          const cloudVar = getCloudVariables().find(v => v.name === name);
          vm.setVariableValue(stage.id, cloudVar.id, data.serverValue);
          lastValues[name] = { value: data.serverValue, timestamp: Date.now() };
        }
      }
    } catch (e) {
      console.error(`[CloudVars] Failed to send ${name}:`, e);
    } finally {
      pendingUpdates.delete(name);
    }
  }

  // One-time initialization: set VM to server values, ignoring timestamps
  async function initializeFromServer() {
    try {
      const response = await fetch(`${SERVER_URL}/api/cloud/all?projectID=${projectID}`);
      const data = await response.json();
      if (!data.success) throw new Error('Failed to get server variables');

      cloudVars = getCloudVariables();

      for (const { name, id } of cloudVars) {
        const serverVar = data.variables[name];
        if (serverVar) {
          // Force VM to server value
          vm.setVariableValue(stage.id, id, serverVar.value);
          lastValues[name] = { value: serverVar.value, timestamp: new Date(serverVar.lastModified) };
          console.log(`[CloudVars] Initialized ${name} to server value: ${serverVar.value}`);
        } else {
          // Server has no value yet → send current VM value
          const value = stage.variables[id].value;
          await sendToServer(name, value);
        }
      }
    } catch (e) {
      console.error('[CloudVars] Initialization failed:', e);
    }
    isInitialized = true;
  }

  // Monitor local changes
  function monitor() {
    cloudVars = getCloudVariables();
    for (const { name, value } of cloudVars) {
      if (pendingUpdates.has(name)) continue;
      if (!lastValues[name]) {
        lastValues[name] = { value, timestamp: 0 };
        if (isInitialized) debounceUpdate(name, value);
      } else if (isInitialized && value !== lastValues[name].value) {
        debounceUpdate(name, value);
      }
    }
  }

  // Poll server for remote changes (timestamp-aware)
  async function pollServerForUpdates() {
    if (!isInitialized) return;
    try {
      const response = await fetch(`${SERVER_URL}/api/cloud/all?projectID=${projectID}`);
      const data = await response.json();
      if (!data.success) return;

      for (const [name, serverVar] of Object.entries(data.variables)) {
        const serverTime = new Date(serverVar.lastModified || Date.now());
        if (!lastValues[name] || serverTime >= new Date(lastValues[name].timestamp)) {
          const cloudVar = getCloudVariables().find(v => v.name === name);
          if (cloudVar) {
            vm.setVariableValue(stage.id, cloudVar.id, serverVar.value);
            lastValues[name] = { value: serverVar.value, timestamp: serverTime };
            console.log(`[CloudVars] Server update applied: ${name} = ${serverVar.value}`);
          }
        }
      }
    } catch (e) {
      console.error('[CloudVars] Polling failed:', e);
    }
  }

  console.log('[CloudVars] Starting timestamp-aware cloud system...');
  initializeFromServer();

  const monitorInterval = setInterval(monitor, 200);   // local changes
  const pollInterval = setInterval(pollServerForUpdates, 1000); // server polling

  // Cleanup function
  window.cloudVarsStop = () => {
    clearInterval(monitorInterval);
    clearInterval(pollInterval);
    updateQueue.forEach(({ timeout }) => clearTimeout(timeout));
    updateQueue.clear();
    pendingUpdates.clear();
    console.log('[CloudVars] Monitoring stopped');
  };
})();
