import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const resolveBase = () => {
  const repository = process.env.GITHUB_REPOSITORY?.split('/')[1];
  const isGitHubActions = process.env.GITHUB_ACTIONS === 'true';

  if (!isGitHubActions || !repository || repository.endsWith('.github.io')) {
    return '/';
  }

  return `/${repository}/`;
};

export default defineConfig({
  plugins: [react()],
  base: resolveBase(),
});
