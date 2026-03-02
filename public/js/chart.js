document.addEventListener('DOMContentLoaded', function () {
    const ctx = document.getElementById('categoryChart').getContext('2d');

    const labels = chartData.map(item => item.category_name);
    const dataValues = chartData.map(item => {
        return totalProducts > 0 ? ((item.product_count / totalProducts) * 100).toFixed(1) : 0;
    });

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'สัดส่วนสินค้า (%)',
                data: dataValues,
                backgroundColor: [
                    'rgba(13, 110, 253, 0.7)',
                    'rgba(25, 135, 84, 0.7)',
                    'rgba(255, 193, 7, 0.7)',
                    'rgba(220, 53, 69, 0.7)',
                    'rgba(108, 117, 125, 0.7)'
                ],
                borderColor: 'rgba(255, 255, 255, 1)',
                borderWidth: 1,
                borderRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: {
                    max: 100,
                    ticks: { callback: value => value + '%' }
                }
            }
        }
    });
});