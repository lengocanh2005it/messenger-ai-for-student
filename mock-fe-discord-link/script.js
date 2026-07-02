const BACKEND_URL = 'http://localhost:3001';

document.getElementById('btn-link-discord').addEventListener('click', async () => {
  showScreen('screen-loading');

  try {
    const res = await fetch(`${BACKEND_URL}/discord/oauth/url`);
    if (!res.ok) throw new Error(`Backend trả về ${res.status}`);
    const { url } = await res.json();
    window.location.href = url;
  } catch (err) {
    console.error(err);
    document.querySelector('#screen-loading p').textContent =
      'Không thể kết nối đến server. Đảm bảo backend đang chạy tại localhost:3001.';
  }
});

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((el) => el.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
