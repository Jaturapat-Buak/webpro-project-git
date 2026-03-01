document.addEventListener('DOMContentLoaded', () => {
    const selectAll = document.getElementById('selectAll');
    const checkboxes = document.querySelectorAll('.product-checkbox');
    const deleteBtn = document.getElementById('deleteBtn');
    const selectedCount = document.getElementById('selectedCount');

    function updateDeleteButton() {
        const checkedCount = document.querySelectorAll('.product-checkbox:checked').length;
        if (selectedCount) selectedCount.textContent = checkedCount;
        
        if (deleteBtn) {
            if (checkedCount > 0) {
                deleteBtn.removeAttribute('disabled');
                deleteBtn.classList.replace('btn-outline-danger', 'btn-danger'); 
            } else {
                deleteBtn.setAttribute('disabled', 'true');
                deleteBtn.classList.replace('btn-danger', 'btn-outline-danger');
            }
        }
    }

    if (selectAll) {
        selectAll.addEventListener('change', (e) => {
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            updateDeleteButton();
        });
    }

    checkboxes.forEach(cb => {
        cb.addEventListener('change', () => {
            const allChecked = Array.from(checkboxes).every(c => c.checked);
            const someChecked = Array.from(checkboxes).some(c => c.checked);
            
            if (selectAll) {
                selectAll.checked = allChecked;
                selectAll.indeterminate = someChecked && !allChecked;
            }
            updateDeleteButton();
        });
    });

    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            const selectedIds = Array.from(document.querySelectorAll('.product-checkbox:checked')).map(cb => cb.value);
            
            if (confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบสินค้าจำนวน ${selectedIds.length} รายการ?`)) {
                fetch('/delete-products', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: selectedIds })
                })
                .then(res => res.json())
                .then(data => {
                    if (data.success) {
                        window.location.reload(); 
                    } else {
                        alert(data.message);
                    }
                })
                .catch(err => console.error('Error:', err));
            }
        });
    }
});