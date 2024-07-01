document.getElementById('bug-report-form').addEventListener('submit', function(event) {
    event.preventDefault();
    
    const title = document.getElementById('title').value;
    const description = document.getElementById('description').value;

    console.log('Submitting bug report:', { title, description });

    fetch('http://localhost:3000/report-bug', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, description }),
    })
    .then(response => {
        if (response.ok) {
            console.log('Bug report submitted successfully');
            alert('Bug report submitted successfully.');
            titleInput.value = '';
            descriptionInput.value = '';
        } else {
            console.log('Failed to submit bug report');
            alert('Failed to submit bug report.');
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert('An error occurred while submitting the bug report.');
    });
});
