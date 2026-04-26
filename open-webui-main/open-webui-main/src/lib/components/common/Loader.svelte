<script lang="ts">
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
	const dispatch = createEventDispatcher();

	let loaderElement: HTMLElement;

	let observer;
	let cooldownId;

	onMount(() => {
		observer = new IntersectionObserver(
			(entries, observer) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						// Single dispatch with cooldown — no flooding
						if (!cooldownId) {
							dispatch('visible');
							// Cooldown: prevent re-triggering for 500ms
							cooldownId = setTimeout(() => {
								cooldownId = null;
								// Re-check if still visible after cooldown
								if (loaderElement) {
									const rect = loaderElement.getBoundingClientRect();
									const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
									if (inViewport) {
										dispatch('visible');
									}
								}
							}, 500);
						}
					} else {
						clearTimeout(cooldownId);
						cooldownId = null;
					}
				});
			},
			{
				root: null, // viewport
				rootMargin: '0px',
				threshold: 0.1 // When 10% of the loader is visible
			}
		);

		observer.observe(loaderElement);
	});

	onDestroy(() => {
		if (observer) {
			observer.disconnect();
		}

		if (cooldownId) {
			clearTimeout(cooldownId);
		}
	});
</script>

<div bind:this={loaderElement}>
	<slot />
</div>
