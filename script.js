let highestZ = 1;

class Paper {
  constructor(paper) {
    this.paper = paper;
    this.x = 0;
    this.y = 0;
    this.rotation = Math.random() * 30 - 15;
    this.dragging = false;
    this.rotating = false;
    this.render();
    this.init();
  }

  render() {
    this.paper.style.transform = `translate(${this.x}px, ${this.y}px) rotate(${this.rotation}deg)`;
  }

  init() {
    this.paper.addEventListener('pointerdown', (event) => {
      this.dragging = true;
      this.rotating = event.button === 2;
      this.startX = event.clientX;
      this.startY = event.clientY;
      this.initialX = this.x;
      this.initialY = this.y;
      this.paper.style.zIndex = ++highestZ;
      this.paper.setPointerCapture(event.pointerId);
    });

    this.paper.addEventListener('pointermove', (event) => {
      if (!this.dragging) return;
      if (this.rotating) {
        const rect = this.paper.getBoundingClientRect();
        this.rotation = Math.atan2(event.clientY - rect.top - rect.height / 2, event.clientX - rect.left - rect.width / 2) * 180 / Math.PI;
      } else {
        this.x = this.initialX + event.clientX - this.startX;
        this.y = this.initialY + event.clientY - this.startY;
      }
      this.render();
    });

    const stop = () => { this.dragging = false; this.rotating = false; };
    this.paper.addEventListener('pointerup', stop);
    this.paper.addEventListener('pointercancel', stop);
    this.paper.addEventListener('contextmenu', (event) => event.preventDefault());
  }
}

document.querySelectorAll('.paper').forEach((paper) => new Paper(paper));

const music = document.querySelector('#background-music');
const musicToggle = document.querySelector('.music-toggle');
const musicLabel = document.querySelector('.music-label');

musicToggle.addEventListener('click', async () => {
  if (music.paused) {
    try {
      await music.play();
      musicToggle.setAttribute('aria-pressed', 'true');
      musicToggle.setAttribute('aria-label', 'Pausar música');
      musicLabel.textContent = 'Pausar música';
    } catch (error) {
      musicLabel.textContent = 'Adicione musica.mp3';
      console.error('Não foi possível tocar a música:', error);
    }
  } else {
    music.pause();
    musicToggle.setAttribute('aria-pressed', 'false');
    musicToggle.setAttribute('aria-label', 'Tocar música');
    musicLabel.textContent = 'Tocar nossa música';
  }
});
