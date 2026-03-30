import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { kineticTools } from '@/interfaces/tools/tools/kinetic.js';
import fs from 'fs-extra';
import path from 'node:path';

describe('Conducks: Skill Suite Unit Tests 💎', () => {
  const skillId = 'pr-review';
  const skillContent = '# PR Review Skill Content';

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should retrieve a valid skill file', async () => {
    const tool = kineticTools.conducks_system;

    //@ts-ignore
    const pathExistsSpy = jest.spyOn(fs, 'pathExists').mockResolvedValue(true as never);
    //@ts-ignore
    const readFileSpy = jest.spyOn(fs, 'readFile').mockResolvedValue(skillContent as never);

    const result: any = await tool.handler({ mode: 'skill', skill: skillId });

    expect(result.skill).toBe(skillId);
    expect(result.content).toBe(skillContent);
    expect(readFileSpy).toHaveBeenCalledWith(expect.stringContaining(`skills/${skillId}.md`), 'utf8');

    pathExistsSpy.mockRestore();
    readFileSpy.mockRestore();
  });

  it('should return error for missing skill file', async () => {
    const tool = kineticTools.conducks_system;

    //@ts-ignore
    const pathExistsSpy = jest.spyOn(fs, 'pathExists').mockResolvedValue(false as never);

    const result: any = await tool.handler({ mode: 'skill', skill: 'non-existent' });

    expect(result.error).toBeDefined();
    expect(result.error).toContain('not found');

    pathExistsSpy.mockRestore();
  });
});
