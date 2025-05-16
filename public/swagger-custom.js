window.addEventListener('load', function () {
  const intervalId = setInterval(function () {
    const topbar = document.querySelector('.topbar .wrapper .topbar-wrapper');
    if (topbar) {
      clearInterval(intervalId); // Stop the interval once topbar is found

      // Create a new button to link to Scalar API Reference
      const button = document.createElement('a');
      button.href = '/docs-scalar';
      button.innerText = 'Switch to Scalar API Reference';
      button.style.padding = '10px';
      button.style.backgroundColor = '#1c2132';
      button.style.color = 'white';
      button.style.justifyContent = 'center';
      button.style.borderRadius = '5px';
      button.style.fontSize = '16px';

      topbar.appendChild(button); // Add the button to the top bar
    }
  }, 100); // Check every 100ms for the top bar element
});
