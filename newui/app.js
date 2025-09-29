import { Router } from './router.js';
import { pageHome, pageHostLobby, pageGame, pageLogin, pageRegister } from './pages.js';

Router.on('/', () => pageHome());
Router.on('/login', () => pageLogin());
Router.on('/register', () => pageRegister());
Router.on('/host/lobby/:sessionId', (p) => pageHostLobby(p));
Router.on('/game/:sessionId', (p) => pageGame(p));

Router.on('/help', () => window.open('#/help-placeholder','_blank'));
Router.on('/learn-more', () => window.open('#/learn-placeholder','_blank'));
Router.on('/terms', () => alert('Terms placeholder'));
Router.on('/privacy', () => alert('Privacy placeholder'));
Router.setNotFound(() => location.hash = '#/');
Router.resolve();