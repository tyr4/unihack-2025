document.addEventListener("DOMContentLoaded", () => {
    const loadingScreen = document.getElementById("loadingScreen");
    setTimeout(() => {
        loadingScreen.classList.add("fade-out");


        setTimeout(() => {
            loadingScreen.style.display = "none";
        }, 3000);

    }, 2800);
});
