document.addEventListener('DOMContentLoaded', function() {
  const slides = document.querySelectorAll('.slide');
  const dotsContainer = document.getElementById('dotsContainer');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const progressFill = document.getElementById('progressFill');

  let currentSlide = 0;
  const totalSlides = slides.length;

  // Initialize dots
  function createDots() {
    for (let i = 0; i < totalSlides; i++) {
      const dot = document.createElement('div');
      dot.className = 'dot' + (i === 0 ? ' active' : '');
      dot.addEventListener('click', () => goToSlide(i));
      dotsContainer.appendChild(dot);
    }
  }

  // Update UI based on current slide
  function updateUI() {
    // Update slides
    slides.forEach((slide, index) => {
      slide.classList.toggle('active', index === currentSlide);
    });

    // Update dots
    document.querySelectorAll('.dot').forEach((dot, index) => {
      dot.classList.toggle('active', index === currentSlide);
    });

    // Update buttons
    prevBtn.style.display = currentSlide === 0 ? 'none' : 'block';
    nextBtn.textContent = currentSlide === totalSlides - 1 ? 'Get Started' : 'Next';

    // Update progress bar
    const progress = ((currentSlide + 1) / totalSlides) * 100;
    progressFill.style.width = progress + '%';
  }

  // Navigate to specific slide
  function goToSlide(index) {
    currentSlide = Math.min(Math.max(index, 0), totalSlides - 1);
    updateUI();
  }

  // Next button handler
  nextBtn.addEventListener('click', () => {
    if (currentSlide === totalSlides - 1) {
      completeOnboarding();
    } else {
      currentSlide++;
      updateUI();
    }
  });

  // Previous button handler
  prevBtn.addEventListener('click', () => {
    if (currentSlide > 0) {
      currentSlide--;
      updateUI();
    }
  });

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === ' ') {
      e.preventDefault();
      nextBtn.click();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      prevBtn.click();
    }
  });

  // Complete onboarding
  function completeOnboarding() {
    // Mark onboarding as completed
    chrome.storage.local.set({ onboardingCompleted: true }, () => {
      // Open the Word Statistics page
      const statsURL = chrome.runtime.getURL('stats.html');
      chrome.tabs.create({ url: statsURL }, () => {
        // Close the onboarding tab
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach(tab => {
            if (tab.url.includes('onboarding.html')) {
              chrome.tabs.remove(tab.id);
            }
          });
        });
      });
    });
  }

  // Initialize
  createDots();
  updateUI();
});
