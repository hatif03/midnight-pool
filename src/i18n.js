const STR = {
  es: {
    play: 'Jugar', settings: 'Ajustes', quit: 'Salir',
    solo: 'Solo', multiplayer: 'Multijugador', back: 'Volver',
    create: 'Crear partida', join: 'Unirse a partida', connect: 'Conectar',
    restart: 'Reiniciar', menu: 'Menú',
    language: 'Idioma', spanish: 'Español', english: 'Inglés',
    nickname: 'Apodo', vibrateOnTurn: 'Vibrar en tu turno', rematch: 'Revancha',
    hostHint: 'Comparte este código con quien quieras jugar.',
    share: 'Compartir enlace', linkCopied: 'Enlace copiado al portapapeles.',
    shareText: '{name} te invita a jugar al Midnight Pool. ¡Únete con el código {code}!',
    joinHint: 'Escribe el código de la sala.',
    aimHint: 'Arrastra desde la bola blanca y suelta para tirar. Cuanto más estiras, más fuerza.',
    shots: 'Tiros', potted: 'Embocadas', you: 'Tú', rival: 'Rival', solids: 'Lisas', stripes: 'Rayadas',
    notifQuestion: '¿Deseas habilitar las notificaciones para saber cuando es tu turno si estás haciendo otras cosas?',
    accept: 'Aceptar', reject: 'Rechazar',
    confirmRestart: '¿Estás seguro de que quieres reiniciar la partida?',
    confirmExit: '¿Estás seguro de que quieres salir?',
    rivalJoined: 'El rival se ha unido a la partida',
    youLeft: 'Te has salido de la partida.',
    rivalLeft: 'El otro jugador se ha desconectado',
    yourTurn: 'Es tu turno.', rivalTurn: 'Es el turno del rival.',
    ballInHandYou: 'Falta: tienes la bola en mano. Colócala donde quieras.',
    placeCueHint: 'Toca la mesa para colocar la bola blanca donde quieras.',
    mustStripes: 'Tienes que meter todas las bolas rayadas.',
    mustSolids: 'Tienes que meter todas las bolas lisas.',
    tableOpen: 'Mesa abierta: la primera bola legal decide los grupos.',
    won: 'Has ganado.', lost: 'Has perdido.',
    notifEnabled: 'Se han habilitado las notificaciones del sistema.',
    notifTurnBody: 'Hey, no te despistes, que es tu turno.',
    connecting: 'Conectando…', waitingHost: 'Conectado. Esperando al anfitrión…',
    closed: 'Conexión cerrada.', notFound: 'No se ha encontrado la sala o el código es incorrecto.',
    code4: 'Escribe el código de 4 letras.',
    quickMatch: 'Partida rápida', quickHint: 'Buscando un rival al azar…', cancel: 'Cancelar',
    searching: 'Buscando…', quickTimeout: 'No se ha encontrado rival. Inténtalo de nuevo.',
    rotateDevice: 'Gira tu dispositivo en horizontal para jugar.',
  },
  en: {
    play: 'Play', settings: 'Settings', quit: 'Quit',
    solo: 'Singleplayer', multiplayer: 'Multiplayer', back: 'Back',
    create: 'Create game', join: 'Join game', connect: 'Connect',
    restart: 'Restart', menu: 'Menu',
    language: 'Language', spanish: 'Spanish', english: 'English',
    nickname: 'Nickname', vibrateOnTurn: 'Vibrate on your turn', rematch: 'Rematch',
    hostHint: 'Share this code with whoever you want to play.',
    share: 'Share invite link', linkCopied: 'Link copied to clipboard.',
    shareText: '{name} invited you to play Midnight Pool. Join with code {code}!',
    joinHint: 'Enter the room code.',
    aimHint: 'Drag from the cue ball and release to shoot. The further you pull, the more power.',
    shots: 'Shots', potted: 'Potted', you: 'You', rival: 'Opponent', solids: 'Solids', stripes: 'Stripes',
    notifQuestion: 'Do you want to enable notifications to know when it is your turn while you are doing other things?',
    accept: 'Accept', reject: 'Decline',
    confirmRestart: 'Are you sure you want to restart the game?',
    confirmExit: 'Are you sure you want to leave?',
    rivalJoined: 'Your opponent has joined the game',
    youLeft: 'You have left the game.',
    rivalLeft: 'The other player has disconnected',
    yourTurn: 'It is your turn.', rivalTurn: 'It is your opponent’s turn.',
    ballInHandYou: 'Foul: ball in hand. Place it anywhere on the table.',
    placeCueHint: 'Tap the table to place the cue ball anywhere you want.',
    mustStripes: 'You must pot all the striped balls.',
    mustSolids: 'You must pot all the solid balls.',
    tableOpen: "Table's open: the first legal ball decides the groups.",
    won: 'You won.', lost: 'You lost.',
    notifEnabled: 'System notifications have been enabled.',
    notifTurnBody: 'Hey, don’t get distracted, it is your turn.',
    connecting: 'Connecting…', waitingHost: 'Connected. Waiting for the host…',
    closed: 'Connection closed.', notFound: 'Room not found or the code is incorrect.',
    code4: 'Enter the 4-letter code.',
    quickMatch: 'Quick match', quickHint: 'Looking for a random opponent…', cancel: 'Cancel',
    searching: 'Searching…', quickTimeout: 'No opponent found. Try again.',
    rotateDevice: 'Rotate your device to landscape to play.',
  },
};

let lang = localStorage.getItem('pool-lang') || 'en';

export function getLang() {
  return lang;
}

export function t(key) {
  return (STR[lang] && STR[lang][key]) || STR.es[key] || key;
}

export function setLang(l) {
  lang = STR[l] ? l : 'es';
  localStorage.setItem('pool-lang', lang);
  applyStatic();
}

export function applyStatic() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
}
