import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface CatalogFile {
  muscleGroups: { code: string }[];
  exercises: { name: string; aliases?: string[] }[];
}

const root = join(__dirname, '..', '..', '..');
const catalog = JSON.parse(
  readFileSync(join(root, 'prisma/seed/exercise-catalog.json'), 'utf8'),
) as CatalogFile;
const doc = readFileSync(join(root, 'docs/CATALOG.md'), 'utf8');

describe('docs/CATALOG.md', () => {
  it('lists every exercise of the catalog with its aliases, one row each', () => {
    const rows = doc
      .split('\n')
      .filter((line) => line.startsWith('| ') && !line.startsWith('| Exercise'));
    expect(rows).toHaveLength(catalog.exercises.length);
    for (const exercise of catalog.exercises) {
      const row = rows.find((line) => line.startsWith(`| ${exercise.name} |`));
      expect(row).toBeDefined();
      for (const alias of exercise.aliases ?? []) expect(row).toContain(alias);
    }
  });

  it('lists every muscle-group code', () => {
    for (const group of catalog.muscleGroups) expect(doc).toContain(`\`${group.code}\``);
  });
});
