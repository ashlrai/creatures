import { useCallback } from 'react';
import { Scene } from './components/Scene';
import { Dashboard } from './components/Dashboard';
import { useSimulation } from './hooks/useSimulation';

export default function App() {
  const {
    createExperiment,
    connect,
    poke,
    pause,
    resume,
    connected,
    experiment,
  } = useSimulation();

  const handleStart = useCallback(async (organism: string) => {
    const exp = await createExperiment(organism);
    connect(exp.id);
  }, [createExperiment, connect]);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <Scene />
      <Dashboard
        onPoke={poke}
        onPause={pause}
        onResume={resume}
        onStart={handleStart}
        connected={connected}
      />
    </div>
  );
}
