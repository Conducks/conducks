import fs from 'fs-extra';
import * as path from 'path';
import * as chokidar from 'chokidar';
import { ArchitectJob, ArchitectTask, CONDUCKSStorage } from '../../core/types.js';
import { loadCONDUCKSWorkspace } from '../../core/storage.js';

// NOTE: DOCS_ROOT removed - using fallback for docs-watcher
const DOCS_ROOT = '/tmp/fallback'; // Temporary fallback - docs-watcher deprecated
