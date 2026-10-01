// The 454 Workshop docs, served at 454workshop.com/docs and inside the desktop app at /docs.
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://454workshop.com',
  base: '/docs',
  // Pages build as plain .html files (control-quickstart.html, not control-quickstart/index.html), so every
  // address the old docs had still works: in the apps' links, the desktop app, and anything shared.
  build: { format: 'file' },
  trailingSlash: 'never',
  integrations: [
    starlight({
      title: '454 Workshop docs',
      description: 'How to use 454 Design and 454 Control: free CNC design, toolpaths and machine control for GRBL routers.',
      logo: { src: './src/assets/logo.svg', alt: '454' },
      favicon: '/favicon.svg',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/ctredway/454-workshop' }],
      editLink: { baseUrl: 'https://github.com/ctredway/454-workshop/edit/master/docs-site/' },
      customCss: ['@fontsource-variable/archivo/wdth.css', '@fontsource-variable/jetbrains-mono', './src/styles/theme.css'],
      components: { SiteTitle: './src/components/SiteTitle.astro', SocialIcons: './src/components/SocialIcons.astro' },
      sidebar: [
        { label: 'Getting started', items: [
          { label: 'Overview', link: '/' },
          { label: 'Before you start', link: '/before-you-start' },
          { label: 'Control quick start', link: '/control-quickstart' },
          { label: 'Design quick start', link: '/design-quickstart' },
          { label: 'Coming from Carbide Motion', link: '/carbide-motion' },
          { label: 'The desktop app', link: '/desktop-app' },
          { label: 'Keyboard shortcuts', link: '/keyboard-shortcuts' },
          { label: 'What’s new', link: '/whats-new' },
        ] },
        { label: '454 Control', items: [
          { label: 'Reference', link: '/control-reference' },
        ] },
        { label: '454 Design', items: [
          { label: 'Tools', link: '/design-tools' },
          { label: 'Workspace', link: '/design-workspace' },
        ] },
        { label: 'Toolpaths (CAM)', badge: { text: 'Beta', variant: 'caution' }, items: [
          { label: 'CAM reference', link: '/cam-reference' },
        ] },
      ],
    }),
  ],
});
