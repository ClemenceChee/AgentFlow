import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'AgentFlow',
  tagline: 'Execution intelligence for AI agent systems',
  favicon: 'img/favicon.ico',

  url: 'https://clemencechee.github.io',
  baseUrl: '/AgentFlow/',

  organizationName: 'ClemenceChee',
  projectName: 'AgentFlow',

  onBrokenLinks: 'warn',
  onBrokenMarkdownLinks: 'warn',

  markdown: {
    format: 'detect',
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  plugins: [
    [
      'docusaurus-plugin-typedoc',
      {
        entryPoints: ['../packages/core/src/index.ts'],
        tsconfig: '../packages/core/tsconfig.json',
        out: 'docs/api/core',
        readme: 'none',
        sidebar: {
          autoConfiguration: true,
          pretty: true,
        },
        textContentMappings: {
          'title.indexPage': 'agentflow-core API',
          'title.memberPage': '{name}',
        },
        parametersFormat: 'table',
        enumMembersFormat: 'table',
        indexFormat: 'table',
        expandObjects: true,
        sourceLinkTemplate: 'https://github.com/ClemenceChee/AgentFlow/blob/master/{path}#L{line}',
      },
    ],
  ],

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: 'https://github.com/ClemenceChee/AgentFlow/tree/master/docs/',
          routeBasePath: '/',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    [
      '@easyops-cn/docusaurus-search-local',
      {
        hashed: true,
        indexBlog: false,
      },
    ],
  ],

  themeConfig: {
    navbar: {
      title: 'AgentFlow',
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docsSidebar',
          position: 'left',
          label: 'Docs',
        },
        {
          href: 'https://github.com/ClemenceChee/AgentFlow',
          label: 'GitHub',
          position: 'right',
        },
        {
          href: 'https://www.npmjs.com/package/agentflow-core',
          label: 'npm',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting Started', to: '/getting-started/installation' },
            { label: 'Architecture', to: '/guides/architecture' },
            { label: 'FAQ', to: '/faq' },
          ],
        },
        {
          title: 'Packages',
          items: [
            { label: 'agentflow-core', href: 'https://www.npmjs.com/package/agentflow-core' },
            { label: 'agentflow-dashboard', href: 'https://www.npmjs.com/package/agentflow-dashboard' },
            { label: 'agentflow-storage', href: 'https://www.npmjs.com/package/agentflow-storage' },
          ],
        },
        {
          title: 'More',
          items: [
            { label: 'GitHub', href: 'https://github.com/ClemenceChee/AgentFlow' },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Clemence Chee. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'python', 'yaml'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
