import { dbGetAll, dbPut } from './db.js';
import { setBlocks, getBlocks, PLAN_START_DATE, PLAN_WEEKS, addDays } from './data/program.js';

export async function loadBlocksIntoCache() {
  const rows = await dbGetAll('blocks');
  if (!rows.length) {
    const block1 = { id: 'block1', label: 'Block 1', startDate: PLAN_START_DATE, weeks: PLAN_WEEKS };
    await dbPut('blocks', block1);
    setBlocks([block1]);
    return [block1];
  }
  setBlocks(rows);
  return rows;
}

export async function addNextBlock(label) {
  const blocks = getBlocks();
  const last = blocks[blocks.length - 1];
  const startDate = addDays(last.startDate, last.weeks * 7);
  const block = { id: `block-${Date.now()}`, label: label || `Block ${blocks.length + 1}`, startDate, weeks: 8 };
  await dbPut('blocks', block);
  const all = await dbGetAll('blocks');
  setBlocks(all);
  return block;
}
