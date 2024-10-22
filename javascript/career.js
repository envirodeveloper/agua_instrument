document.addEventListener('DOMContentLoaded', () => {
    // Function to update the progress segments
    const updateProgressSegments = (activeIndex) => {
        document.querySelectorAll('.career-progress-segment').forEach((segment, index) => {
            if (index <= activeIndex) {
                segment.classList.add('active');
            } else {
                segment.classList.remove('active');
            }
        });
    };
    

    // Show the first card by default and set the initial active segments
    document.getElementById('card1').classList.add('show');
    updateProgressSegments(0);
    
    // Add click event listeners to all progress segments
    document.querySelectorAll('.career-progress-segment').forEach((segment, index) => {
        segment.addEventListener('click', () => {
            // Hide all cards
            document.querySelectorAll('.career-card').forEach(card => card.classList.remove('show'));
            // Show the clicked card
            const cardId = segment.getAttribute('data-card');
            document.getElementById(cardId).classList.add('show');
            // Update the active segments
            updateProgressSegments(index);
        });
    });
});