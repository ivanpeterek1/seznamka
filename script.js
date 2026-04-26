document.addEventListener('DOMContentLoaded', function() {
    const subDomSlider = document.getElementById('sub_dom');
    const subDomValue = document.getElementById('sub_dom_value');

    // Update the displayed value for the slider
    subDomSlider.addEventListener('input', function() {
        subDomValue.textContent = this.value;
    });

    // Form submission is handled by the form action
});