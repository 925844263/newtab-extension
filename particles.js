/* 彩色网状线条粒子动画（原生 JS 改写，无需 jQuery）
   来源：html5 canvas 彩色网状线条粒子动画特效，粒子跟随鼠标连线 */

(function () {
  function initParticles() {
    const canvas = document.getElementById("particleCanvas");
    if (!canvas) return { start() {}, stop() {} };
    const ctx = canvas.getContext("2d");

    let width = 0, height = 0;
    let running = false, rafId = null;

    const dots = {
      nb: 140,          // 粒子数量
      distance: 110,    // 连线最大距离
      d_radius: 150,    // 鼠标作用半径
      array: []
    };

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width;
      canvas.height = height;
    }

    function colorValue(min) {
      return Math.floor(Math.random() * 255 + (min || 0));
    }
    function createColorStyle(r, g, b) {
      return "rgba(" + r + "," + g + "," + b + ", 0.8)";
    }
    function mixComponents(comp1, weight1, comp2, weight2) {
      return (comp1 * weight1 + comp2 * weight2) / (weight1 + weight2);
    }

    function Color(min) {
      min = min || 0;
      this.r = colorValue(min);
      this.g = colorValue(min);
      this.b = colorValue(min);
      this.style = createColorStyle(this.r, this.g, this.b);
    }

    function Dot() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.vx = -0.5 + Math.random();
      this.vy = -0.5 + Math.random();
      this.radius = Math.random() * 2;
      this.color = new Color();
    }
    Dot.prototype.draw = function () {
      ctx.beginPath();
      ctx.fillStyle = this.color.style;
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
      ctx.fill();
    };

    function averageColorStyles(d1, d2) {
      const r = mixComponents(d1.color.r, d1.radius, d2.color.r, d2.radius);
      const g = mixComponents(d1.color.g, d1.radius, d2.color.g, d2.radius);
      const b = mixComponents(d1.color.b, d1.radius, d2.color.b, d2.radius);
      return createColorStyle(Math.floor(r), Math.floor(g), Math.floor(b));
    }

    let mousePosition = { x: 0, y: 0 };
    let mouseActive = false;

    function createDots() {
      dots.array = [];
      for (let i = 0; i < dots.nb; i++) dots.array.push(new Dot());
    }

    function moveDots() {
      for (let i = 0; i < dots.nb; i++) {
        const d = dots.array[i];
        if (d.y < 0 || d.y > height) d.vy = -d.vy;
        if (d.x < 0 || d.x > width) d.vx = -d.vx;
        d.x += d.vx;
        d.y += d.vy;
      }
    }

    function nearMouse(d) {
      if (!mouseActive) return true; // 未移动鼠标时，默认在屏幕中心附近连线
      const dx = d.x - mousePosition.x;
      const dy = d.y - mousePosition.y;
      return dx > -dots.d_radius && dx < dots.d_radius && dy > -dots.d_radius && dy < dots.d_radius;
    }

    function connectDots() {
      for (let i = 0; i < dots.nb; i++) {
        for (let j = i + 1; j < dots.nb; j++) {
          const a = dots.array[i], b = dots.array[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          if (Math.abs(dx) < dots.distance && Math.abs(dy) < dots.distance) {
            // 仅当两个粒子都处于鼠标作用半径内才连线（跟随鼠标）
            if (nearMouse(a) && nearMouse(b)) {
              ctx.beginPath();
              ctx.strokeStyle = averageColorStyles(a, b);
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
              ctx.closePath();
            }
          }
        }
      }
    }

    function drawDots() {
      for (let i = 0; i < dots.nb; i++) dots.array[i].draw();
    }

    function animate() {
      if (!running) return;
      ctx.clearRect(0, 0, width, height);
      moveDots();
      connectDots();
      drawDots();
      rafId = requestAnimationFrame(animate);
    }

    function start() {
      if (running) return;
      running = true;
      animate();
    }
    function stop() {
      running = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    // 鼠标跟随
    window.addEventListener("mousemove", (e) => {
      mousePosition.x = e.clientX;
      mousePosition.y = e.clientY;
      mouseActive = true;
    });
    window.addEventListener("mouseleave", () => {
      mouseActive = false;
    });
    window.addEventListener("resize", resize);

    resize();
    createDots();

    return { start, stop };
  }

  window.initParticles = initParticles;
})();
