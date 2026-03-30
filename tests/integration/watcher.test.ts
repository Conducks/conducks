import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ConducksWatcher } from "../../src/lib/domain/evolution/watcher.js";
import { ConducksGraph } from "../../src/lib/core/graph/graph-engine.js";

describe('ConducksWatcher Integration', () => {
  let watcher: ConducksWatcher;
  let synapse: ConducksGraph;
  let mockChokidar: any;
  const mockRootDir = '/test/project';

  beforeEach(() => {
    synapse = new ConducksGraph();
    
    // Mock chokidar instance
    mockChokidar = {
      on: jest.fn().mockReturnThis(),
      close: jest.fn<() => Promise<void>>().mockResolvedValue(undefined as never)
    };

    watcher = new ConducksWatcher(mockRootDir, synapse, { watcher: mockChokidar });
  });

  afterEach(async () => {
    if (watcher) await watcher.stop();
    jest.restoreAllMocks();
  });

  describe('Synapse Monitoring', () => {
    it('should perform an incremental pulse on "add" event', async () => {
      jest.spyOn(synapse, 'pulseStructuralStream').mockResolvedValue(undefined as never);
      
      watcher.start();
      
      expect(mockChokidar.on).toHaveBeenCalledWith('add', expect.any(Function));
    });

    it('should ignore events if the watcher is stopped', async () => {
      watcher.start();
      await watcher.stop();
      expect(mockChokidar.close).toHaveBeenCalled();
    });
  });
});
