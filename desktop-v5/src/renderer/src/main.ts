import '@fontsource-variable/fraunces/opsz.css'
import '@fontsource-variable/source-serif-4/opsz.css'
import '@fontsource-variable/source-serif-4/opsz-italic.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/prose.css'
import { mount } from 'svelte'
import App from './App.svelte'
import { loadLanguage } from './state/prefs.svelte'

void loadLanguage().then(() => mount(App, { target: document.getElementById('app')! }))
