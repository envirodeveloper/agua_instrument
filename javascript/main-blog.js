
document.addEventListener('DOMContentLoaded', () => {
    const verticalCarousel = document.querySelector('.blogs-category-carousel-inner');
    const verticalItems = Array.from(verticalCarousel.querySelectorAll('.blogs-category-carousel-item'));
    let currentIndex = 0;

    // Function to update the vertical carousel
    const updateVerticalCarousel = () => {
        verticalItems.forEach((item, index) => {
            item.classList.remove('next', 'prev', 'next-next', 'prev-prev', 'active');
            if (index === currentIndex) {
                item.classList.add('active');
            } else if (index === (currentIndex + 1) % verticalItems.length) {
                item.classList.add('next');
            } else if (index === (currentIndex + 2) % verticalItems.length) {
                item.classList.add('next-next');
            } else if (index === (currentIndex - 1 + verticalItems.length) % verticalItems.length) {
                item.classList.add('prev');
            } else if (index === (currentIndex - 2 + verticalItems.length) % verticalItems.length) {
                item.classList.add('prev-prev');
            }
        });
    };

    // Function to update the horizontal card row based on the current carousel item
    const updateHorizontalRow = (rowCards) => {
        const cardRow = document.querySelector('.blogs-category-card-row');
        cardRow.innerHTML = ''; // Clear existing cards

        rowCards.forEach(cardData => {
            const card = document.createElement('div');
            card.classList.add('blogs-category-card');

            card.innerHTML = `
                <a href="${cardData.link}">
                    <img src="${cardData.img}" alt="${cardData.title}">
                    <div class="content">
                        <h2 class="title">${cardData.title}</h2>
                        <p class="text">${cardData.text}</p>
                    </div>
                </a>
            `;

            cardRow.appendChild(card);
        });
    };

    // Data for each set of horizontal cards corresponding to each carousel item
    const rowCardData = [
        [
            { img: './blogs-images/gas_installation_guide.jpg', title: ' Installation Guides', text: 'How to Install Your Agua Instruments Gas Analyzer: A Step-by-Step Guide.', link: '/blogs/technical-guide/gas-analyzer-installation.html' },
            { img: './blogs-images/water-analyzer-calibration.png', title: 'Calibration Procedures', text: 'Calibrating Your Water Analyzer: Best Practices for Accurate Results.', link: '/blogs/technical-guide/water-analyzer-calibration.html' },
            { img: './blogs-images/maintenance-troubleshooting.webp', title: ' Maintenance and Troubleshooting', text: 'Troubleshooting Your Dust Analyzer: Common Issues and Solutions', link: '/blogs/technical-guide/dust-analyzer-maintenance.html' },
            { img: './blogs-images/auto-sampler-data-integration.png', title: 'System Integration', text: 'Integrating Your Auto Sampler with Laboratory Information Management Systems (LIMS).', link: '/blogs/technical-guide/auto-sampler-integration.html' },
            { img: './blogs-images/aaqms-data-interpretation.png', title: 'Data Interpretation', text: 'Understanding Your Real-Time AAQMS Data: A Comprehensive Guide.', link: '/blogs/technical-guide/aaqms-data-interpretation.html' },
            { img: './blogs-images/gas-analyzer-atex-certification.jpg', title: 'Regulatory Compliance', text: 'Ensuring Regulatory Compliance with ATEX Certified Gas Analyzers.', link: '/blogs/technical-guide/gas-analyzer-atex-certified.html' },
            { img: './blogs-images/toc-analyzer-product-comparison.png', title: 'Product Comparisons', text: 'Comparing Different TOC Analyzers: Which One is Right for Your Laboratory?', link: '/blogs/technical-guide/toc-analyzer-product-comparisons.html' },
        ],
        [
            // { img: './blogs-images/new-image1.jpg', title: 'Green Technology Innovations', text: 'How Agua Instruments Gas Analyzers are Leading the Way in Green Technology.', link: '#' },
            // { img: './blogs-images/new-image2.jpg', title: 'Energy Efficiency Tips', text: 'Maximizing Energy Efficiency with Continuous Water Analysis Systems.', link: '#' },
            // { img: './blogs-images/new-image3.jpg', title: 'Sustainable Water Management', text: 'Sustainable Water Management with Multi-Parameter Water Analyzers.', link: '#' },
            // { img: './blogs-images/new-image4.jpg', title: 'Emissions Monitoring and Reduction', text: 'Effective Emissions Monitoring and Reduction with High-Temperature Gas Analyzers.', link: '#' },
            // { img: './blogs-images/new-image5.jpg', title: 'Water Pollution Prevention', text: 'Preventing Water Pollution with Real-Time Water Analysis and Monitoring.', link: '#' },
            // { img: './blogs-images/new-image6.jpg', title: ' Innovative Waste Management', text: 'Sustainable Waste Management with Online Water Quality Monitoring.', link: '#' },
        ],
        [
        { img: '/blogs-images/blog-recap-event.jpg', title: 'Event Recap: Driving Innovation in Environmental Monitoring', text: 'Event Recap: Sustainability Summit Highlights Future of Environmental Monitoring.', link: '/blogs/partnership-&-collabration/event-recap.html' },
        { img: './blogs-images/partnership.jpg', title: 'New Partnership Announcement: Expanding Global Reach in Environmental Solutions', text: 'New Partnership: Strengthening Global Presence in Industrial Emissions Monitoring.', link: '/blogs/partnership-&-collabration/new-partnership.html' },
        { img: './blogs-images/community-innitiative.webp', title: 'Community Engagement: Educating Next Generation on Environmental Responsibility', text: 'Community Initiative: Partnering with Schools for Environmental Education.', link: '/blogs/partnership-&-collabration/community-initiative.html' },
        { img: './blogs-images/customer-success.jpeg', title: 'Customer Success Story: Improving Agricultural Sustainability Through IoT Solutions', text: 'Customer Success: Precision Farming with IoT Soil Monitoring.', link: '/blogs/partnership-&-collabration/customer-success.html' },
        { img: './blogs-images/healthcare-partnership.jpg', title: 'Industry Focus: Innovating Healthcare Waste Management with IoT', text: 'Healthcare Partnership: IoT Solutions for Safe Medical Waste Disposal.', link: '/blogs/partnership-&-collabration/healthcare-partnership.html' },
        { img: './blogs-images/ai-collabration.jpeg', title: 'Technology Partnership: Harnessing AI for Predictive Environmental Insights', text: 'AI Collaboration: Predictive Analytics for Efficient Waste Management.', link: '/blogs/partnership-&-collabration/ai-collaboration.html' },
        ],
        [
        { img: './blogs-images/smart-sensors.webp', title: 'Smart Sensor Technology: IoT Solutions for Precise Air Quality Monitoring', text: 'Smart Sensors: Transforming Air Quality Monitoring with IoT.', link: '/blogs/innovations-&-technologies/smart-sensors.html' },
        { img: './blogs-images/water-quality-sensors.avif', title: 'Innovative Water Quality Sensors: Ensuring Safe Drinking Water with Advanced Technology', text: 'Water Quality Sensors: Innovations in Safe Drinking Water Monitoring.', link: '/blogs/innovations-&-technologies/water-quality-sensors.html' },
        { img: './blogs-images/emission-control.webp', title: 'Next-Gen Gas Analyzers: Advancements in Emissions Monitoring and Control', text: 'Emissions Control: Next-Gen Gas Analyzers for Sustainable Industries.', link: '/blogs/innovations-&-technologies/emissions-control.html' },
        { img: './blogs-images/Biotechnology-in-Remediation.jpg', title: 'Biotechnology Innovations in Environmental Remediation: Cleaning Contaminated Sites', text: 'Biotechnology in Remediation: Innovations for Environmental Cleanup.', link: '/blogs/innovations-&-technologies/biotechnology-in-remediation.html' },
        { img: './blogs-images/Blockchain-Technology.png', title: 'Blockchain Applications in Environmental Monitoring: Ensuring Data Integrity', text: 'Blockchain in Environmental Monitoring: Securing Data Integrity', link: '/blogs/innovations-&-technologies/blockchain-in-environmental-monitoring.html' },
        { img: './blogs-images/renewable-energy.webp', title: 'Renewable Energy Monitoring Systems: Harnessing Sustainability in Power Generation', text: 'Renewable Energy Monitoring: Innovations for Sustainable Power.', link: '/blogs/innovations-&-technologies/renewablr-energy-monitoring.html' },
        { img: './blogs-images/data-visualization.png', title: 'Advanced Data Visualization Tools: Turning Complex Environmental Data into Actionable Insights', text: 'Data Visualization: Tools for Actionable Insights in Environmental Monitoring.', link: '/blogs/innovations-&-technologies/data-visualization.html' },
     ],

// [
// { img: './blogs-images/new-image1.jpg', title: 'Environmental Impact Stories', text: 'Environmental Conservation: Preserving Marine Ecosystems with Advanced Monitoring', link: '#' },
// { img: './blogs-images/new-image2.jpg', title: 'Regulatory Compliance', text: 'Ensuring Compliance: Case Studies in Air Quality Monitoring for Healthcare Facilities', link: '#' },
// { img: './blogs-images/new-image3.jpg', title: 'Community and Public Health', text: 'Promoting Public Health: Monitoring Drinking Water Quality', link: '#' },
// { img: './blogs-images/new-image4.jpg', title: 'Case Studies', text: 'Case Study: Monitoring Air Quality in Urban Centers', link: '#' },
// { img: './blogs-images/new-image5.jpg', title: 'Innovative Applications', text: 'Innovative Use of IoT Sensors in Industrial Emissions Monitoring', link: '#' },

// ],
// [
// { img: './blogs-images/new-image1.jpg', title: 'Impact of International Standards', text: 'Understanding ISO Standards: Ensuring Global Compliance in Environmental Monitoring', link: '' },
// { img: './blogs-images/new-image2.jpg', title: 'Regulatory Training and Education', text: 'Workshop Recap: Training Session on Navigating Environmental Regulations', link: '#' },
// { img: './blogs-images/new-image3.jpg', title: 'Expert Insights on Compliance Strategies', text: 'Expert Panel Discussion: Strategies for Staying Ahead in Environmental Compliance.', link: '#' },
// { img: './blogs-images/new-image4.jpg', title: 'Best Practices in Regulatory Reporting', text: 'Best Practices for Environmental Data Reporting Under New Regulations', link: '#' },

// ],
        // Add more sets of cards for other vertical items if needed
    ];

    document.querySelector('.blogs-category-arrow.up').addEventListener('click', () => {
        currentIndex = (currentIndex - 1 + verticalItems.length) % verticalItems.length;
        updateVerticalCarousel();
        updateHorizontalRow(rowCardData[currentIndex]);
    });

    document.querySelector('.blogs-category-arrow.down').addEventListener('click', () => {
        currentIndex = (currentIndex + 1) % verticalItems.length;
        updateVerticalCarousel();
        updateHorizontalRow(rowCardData[currentIndex]);
    });

    let horizontalIndex = 0;

    document.querySelector('.blogs-category-arrow.left').addEventListener('click', () => {
        horizontalIndex = (horizontalIndex > 0) ? horizontalIndex - 1 : rowCardData[currentIndex].length - 1;
        document.querySelector('.blogs-category-card-row').style.transform = `translateX(-${horizontalIndex * 370}px)`; // Adjust for card width and padding
    });

    document.querySelector('.blogs-category-arrow.right').addEventListener('click', () => {
        horizontalIndex = (horizontalIndex < rowCardData[currentIndex].length - 1) ? horizontalIndex + 1 : 0;
        document.querySelector('.blogs-category-card-row').style.transform = `translateX(-${horizontalIndex * 370}px)`; // Adjust for card width and padding
    });

    updateVerticalCarousel();
    updateHorizontalRow(rowCardData[currentIndex]);
});


