import { metaGet, metaSet } from './db.js';

export async function applyTheme() {
  const theme = await metaGet('theme', 'dark'); // dark by default per spec
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
  return theme;
}

export async function setTheme(theme) {
  await metaSet('theme', theme);
  return applyTheme();
}
