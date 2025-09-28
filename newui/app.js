import { Router } from './router.js';
import { pageHome, pageHostLobby, pageGame } from './pages.js';

Router.on('/', () => pageHome());
Router.on('/host/lobby/:sessionId', (params) => pageHostLobby(params));
Router.on('/game/:sessionId', (params) => pageGame(params));
Router.on('/login', () => alert('Login page placeholder'));
Router.on('/register', () => alert('Register page placeholder'));
Router.on('/forgot-password', () => alert('Forgot password page placeholder'));
Router.on('/reset-password', () => alert('Reset password page placeholder'));
Router.on('/account', () => alert('Account page placeholder'));
Router.on('/billing/extend', () => alert('Billing Extend (simulate)'));
Router.on('/billing/pass', () => alert('Billing Extra Weekly Game (simulate)'));
Router.on('/billing/upgrade', () => alert('Billing Upgrade (simulate)'));
Router.on('/help', () => alert('Help placeholder (opens new window)'));
Router.on('/learn-more', () => alert('Learn more placeholder (opens new window)'));
Router.on('/terms', () => alert('Terms placeholder'));
Router.on('/privacy', () => alert('Privacy placeholder'));

Router.setNotFound(() => location.hash = '#/');

Router.resolve();