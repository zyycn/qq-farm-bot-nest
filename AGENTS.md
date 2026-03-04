---
description: 
alwaysApply: true
---

# AGENTS

<skills_system priority="1">

## Available Skills

<!-- SKILLS_TABLE_START -->
<usage>
When users ask you to perform tasks, check if any of the available skills below can help complete the task more effectively. Skills provide specialized capabilities and domain knowledge.

How to use skills:
- Invoke: `npx openskills read <skill-name>` (run in your shell)
  - For multiple: `npx openskills read skill-one,skill-two`
- The skill content will load with detailed instructions on how to complete the task
- Base directory provided in output for resolving bundled resources (references/, scripts/, assets/)

Usage notes:
- Only use skills listed in <available_skills> below
- Do not invoke a skill that is already loaded in your context
- Each skill invocation is stateless
</usage>

<available_skills>

<skill>
<name>antdv-next</name>
<description>Antdv Next Vue 3 component library. Use when locating component API docs, props/events/slots, or playground demos.</description>
<location>project</location>
</skill>

<skill>
<name>antfu</name>
<description>Anthony Fu's opinionated tooling and conventions for JavaScript/TypeScript projects. Use when setting up new projects, configuring ESLint/Prettier alternatives, monorepos, library publishing, or when the user mentions Anthony Fu's preferences.</description>
<location>project</location>
</skill>

<skill>
<name>nestjs-best-practices</name>
<description>NestJS best practices and architecture patterns for building production-ready applications. This skill should be used when writing, reviewing, or refactoring NestJS code to ensure proper patterns for modules, dependency injection, security, and performance.</description>
<location>project</location>
</skill>

<skill>
<name>nuxt</name>
<description>Nuxt full-stack Vue framework with SSR, auto-imports, and file-based routing. Use when working with Nuxt apps, server routes, useFetch, middleware, or hybrid rendering.</description>
<location>project</location>
</skill>

<skill>
<name>pinia</name>
<description>Pinia official Vue state management library, type-safe and extensible. Use when defining stores, working with state/getters/actions, or implementing store patterns in Vue apps.</description>
<location>project</location>
</skill>

<skill>
<name>pnpm</name>
<description>Node.js package manager with strict dependency resolution. Use when running pnpm specific commands, configuring workspaces, or managing dependencies with catalogs, patches, or overrides.</description>
<location>project</location>
</skill>

<skill>
<name>slidev</name>
<description>Create and present web-based slides for developers using Markdown, Vue components, code highlighting, animations, and interactive features. Use when building technical presentations, conference talks, or teaching materials.</description>
<location>project</location>
</skill>

<skill>
<name>tsdown</name>
<description>Bundle TypeScript and JavaScript libraries with blazing-fast speed powered by Rolldown. Use when building libraries, generating type declarations, bundling for multiple formats, or migrating from tsup.</description>
<location>project</location>
</skill>

<skill>
<name>turborepo</name>
<description>|</description>
<location>project</location>
</skill>

<skill>
<name>ui-ux-pro-max</name>
<description>"UI/UX design intelligence. 50 styles, 21 palettes, 50 font pairings, 20 charts, 9 stacks (React, Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind, shadcn/ui). Actions: plan, build, create, design, implement, review, fix, improve, optimize, enhance, refactor, check UI/UX code. Projects: website, landing page, dashboard, admin panel, e-commerce, SaaS, portfolio, blog, mobile app, .html, .tsx, .vue, .svelte. Elements: button, modal, navbar, sidebar, card, table, form, chart. Styles: glassmorphism, claymorphism, minimalism, brutalism, neumorphism, bento grid, dark mode, responsive, skeuomorphism, flat design. Topics: color palette, accessibility, animation, layout, typography, font pairing, spacing, hover, shadow, gradient. Integrations: shadcn/ui MCP for component search and examples."</description>
<location>project</location>
</skill>

<skill>
<name>unocss</name>
<description>UnoCSS instant atomic CSS engine, superset of Tailwind CSS. Use when configuring UnoCSS, writing utility rules, shortcuts, or working with presets like Wind, Icons, Attributify.</description>
<location>project</location>
</skill>

<skill>
<name>vite</name>
<description>Vite build tool configuration, plugin API, SSR, and Vite 8 Rolldown migration. Use when working with Vite projects, vite.config.ts, Vite plugins, or building libraries/SSR apps with Vite.</description>
<location>project</location>
</skill>

<skill>
<name>vitepress</name>
<description>VitePress static site generator powered by Vite and Vue. Use when building documentation sites, configuring themes, or writing Markdown with Vue components.</description>
<location>project</location>
</skill>

<skill>
<name>vitest</name>
<description>Vitest fast unit testing framework powered by Vite with Jest-compatible API. Use when writing tests, mocking, configuring coverage, or working with test filtering and fixtures.</description>
<location>project</location>
</skill>

<skill>
<name>vue</name>
<description>Vue 3 Composition API, script setup macros, reactivity system, and built-in components. Use when writing Vue SFCs, defineProps/defineEmits/defineModel, watchers, or using Transition/Teleport/Suspense/KeepAlive.</description>
<location>project</location>
</skill>

<skill>
<name>vue-best-practices</name>
<description>MUST be used for Vue.js tasks. Strongly recommends Composition API with `<script setup>` and TypeScript as the standard approach. Covers Vue 3, SSR, Volar, vue-tsc. Load for any Vue, .vue files, Vue Router, Pinia, or Vite with Vue work. ALWAYS use Composition API unless the project explicitly requires Options API.</description>
<location>project</location>
</skill>

<skill>
<name>vue-router-best-practices</name>
<description>"Vue Router 4 patterns, navigation guards, route params, and route-component lifecycle interactions."</description>
<location>project</location>
</skill>

<skill>
<name>vue-testing-best-practices</name>
<description>Use for Vue.js testing. Covers Vitest, Vue Test Utils, component testing, mocking, testing patterns, and Playwright for E2E testing.</description>
<location>project</location>
</skill>

<skill>
<name>vueuse-functions</name>
<description>Apply VueUse composables where appropriate to build concise, maintainable Vue.js / Nuxt features.</description>
<location>project</location>
</skill>

<skill>
<name>web-design-guidelines</name>
<description>Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".</description>
<location>project</location>
</skill>

</available_skills>
<!-- SKILLS_TABLE_END -->

</skills_system>
