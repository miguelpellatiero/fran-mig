// ===== CONFIGURAÇÃO DO SUPABASE =====
// Substitua com seus dados
const SUPABASE_URL = 'https://tkxbttagpesinzbqmkkm.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_E_Z4ue8KBJY9UUS2MDUClQ_inijIxoe';

// Criar cliente Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== ELEMENTOS =====
const grid = document.getElementById('photoGrid');
const photoCount = document.getElementById('photoCount');
const modalOverlay = document.getElementById('modalOverlay');
const openModalBtn = document.getElementById('openModalBtn');
const closeModalBtn = document.getElementById('closeModalBtn');
const uploadForm = document.getElementById('uploadForm');
const toastEl = document.getElementById('toast');
const logoutBtn = document.getElementById('logoutBtn');

// ===== PEGAR USUÁRIO DA URL =====
// COLOQUE AQUI a linha que você perguntou
const params = new URLSearchParams(location.search);
const usuario = params.get('usuario');
if (usuario) {
  document.getElementById('addedByInput').value = usuario;
}

// ===== BOLHAS =====
function createBubbles() {
  const container = document.getElementById('bubbles');
  if (!container) return;
  for (let i = 0; i < 18; i++) {
    const size = 10 + Math.random() * 24;
    const b = document.createElement('div');
    b.className = 'bubble';
    b.style.width = size + 'px';
    b.style.height = size + 'px';
    b.style.left = Math.random() * 100 + '%';
    b.style.setProperty('--drift', (Math.random() * 40 - 20) + 'px');
    b.style.animationDuration = (14 + Math.random() * 22) + 's';
    b.style.animationDelay = (Math.random() * 20) + 's';
    b.style.background =
      i % 3 === 0
        ? 'radial-gradient(circle at 30% 30%, rgba(124,77,255,0.4), rgba(255,111,156,0.2))'
        : 'radial-gradient(circle at 30% 30%, rgba(255,111,156,0.3), rgba(124,77,255,0.15))';
    container.appendChild(b);
  }
}
createBubbles();

// ===== TOAST =====
let toastTimeout;
function showToast(msg, duration = 2000) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toastEl.classList.remove('show'), duration);
}

// ===== CARREGAR FOTOS =====
async function loadPhotos() {
  try {
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      grid.innerHTML = '<p style="text-align:center;color:var(--smoke-dim);padding:30px 0;">Nenhuma foto ainda. Adicione a primeira! ❤️</p>';
      photoCount.textContent = '0 fotos';
      return;
    }

    grid.innerHTML = data.map(photo => `
      <div class="photo-card">
        <img src="${photo.image_url}" alt="${photo.title || 'Foto'}" loading="lazy" />
        <div class="info">
          <h3>${photo.title || 'Sem título'}</h3>
          ${photo.description ? `<p>${photo.description}</p>` : ''}
          <span class="added-by">${photo.added_by ? 'Adicionada por ' + photo.added_by : 'Anônimo'}</span>
        </div>
      </div>
    `).join('');

    photoCount.textContent = data.length + ' foto' + (data.length !== 1 ? 's' : '');
  } catch (err) {
    console.error(err);
    showToast('Erro ao carregar fotos: ' + err.message, 3000);
  }
}

// ===== UPLOAD =====
async function uploadPhoto(file, title, description, addedBy) {
  try {
    // 1. Upload para Storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `public/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(filePath, file);

    if (uploadError) throw new Error('Upload falhou: ' + uploadError.message);

    // 2. Obter URL pública
    const { data: urlData } = supabase.storage
      .from('photos')
      .getPublicUrl(filePath);
    const imageUrl = urlData.publicUrl;

    // 3. Inserir na tabela
    const { error: insertError } = await supabase
      .from('photos')
      .insert([{
        image_url: imageUrl,
        title: title || null,
        description: description || null,
        added_by: addedBy || null
      }]);

    if (insertError) throw new Error('Erro ao salvar dados: ' + insertError.message);

    return true;
  } catch (err) {
    console.error(err);
    showToast(err.message, 3000);
    return false;
  }
}

// ===== EVENTOS =====

// Abrir modal
openModalBtn.addEventListener('click', () => {
  modalOverlay.style.display = 'flex';
});

// Fechar modal
function closeModal() {
  modalOverlay.style.display = 'none';
  uploadForm.reset();
  document.getElementById('submitBtn').disabled = false;
  document.getElementById('submitBtn').textContent = 'Salvar';
}
closeModalBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal();
});

// Enviar
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const title = document.getElementById('titleInput').value.trim();
  const description = document.getElementById('descInput').value.trim();
  const addedBy = document.getElementById('addedByInput').value.trim();
  const fileInput = document.getElementById('fileInput');
  const file = fileInput.files[0];

  if (!file) {
    showToast('Selecione uma imagem.', 2000);
    return;
  }

  const submitBtn = document.getElementById('submitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Enviando...';

  const success = await uploadPhoto(file, title, description, addedBy);

  submitBtn.disabled = false;
  submitBtn.textContent = 'Salvar';

  if (success) {
    closeModal();
    showToast('Foto adicionada com sucesso! 🎉', 2000);
    loadPhotos();
  }
});

// Logout (exemplo)
logoutBtn.addEventListener('click', () => {
  if (confirm('Deseja sair?')) {
    window.location.href = '/login.html'; // ajuste para sua página de login
  }
});

// ===== INICIALIZAR =====
loadPhotos();