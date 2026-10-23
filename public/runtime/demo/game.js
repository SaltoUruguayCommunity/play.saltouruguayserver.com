let score = 0, play;
const status = document.getElementById('message');
const update = () => document.getElementById('score').textContent = String(score);
async function start() { try { play = await SaltoPlay.init(); const player = await play.player.getSaltoTag(); document.getElementById('identity').textContent = player.tag; status.textContent = 'Bridge conectado. Tu próxima estrella te espera.'; } catch (e) { status.textContent = 'No pudimos conectar el SDK: ' + e.message; } }
document.getElementById('planet').addEventListener('click', async () => { if (!play) return; score++; update(); if (score === 1) { try { await play.achievements.requestUnlock('first-star'); status.textContent = 'Primer contacto · Tu primera estrella.'; } catch (e) { status.textContent = e.message; } } });
document.getElementById('save').addEventListener('click', async () => { try { if (!play) return; await play.saves.set('slot-1', { score }); status.textContent = 'Progreso guardado a través del bridge.'; } catch (e) { status.textContent = e.message; } });
document.getElementById('restore').addEventListener('click', async () => { try { if (!play) return; const data = await play.saves.get('slot-1'); if (!data) { status.textContent = 'Todavía no guardaste una partida.'; return; } score = data.score; update(); status.textContent = 'Guardado recuperado desde SaltoPlay.'; } catch (e) { status.textContent = e.message; } });
start();
