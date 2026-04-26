<script lang="ts">
	import { toast } from 'svelte-sonner';

	import { tick, getContext, onMount, createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();
	const i18n = getContext('i18n');

	import { settings } from '$lib/stores';
	import { copyToClipboard } from '$lib/utils';

	import MultiResponseMessages from './MultiResponseMessages.svelte';
	import ResponseMessage from './ResponseMessage.svelte';
	import UserMessage from './UserMessage.svelte';

	export let chatId;
	export let selectedModels = [];
	export let idx = 0;

	export let history;
	export let messageId;

	export let user;

	export let setInputText: Function = () => {};
	export let gotoMessage;
	export let showPreviousMessage;
	export let showNextMessage;
	export let updateChat;

	export let editMessage;
	export let saveMessage;
	export let deleteMessage;
	export let rateMessage;
	export let actionMessage;
	export let submitMessage;

	export let regenerateResponse;
	export let continueResponse;
	export let mergeResponses;

	export let addMessages;
	export let triggerScroll;
	export let readOnly = false;
	export let editCodeBlock = true;
	export let topPadding = false;
</script>

<div
	id="message-{messageId}"
	role="listitem"
	class="relative flex flex-col justify-between px-5 mb-3 w-full {($settings?.widescreenMode ?? null)
		? 'max-w-full'
		: 'max-w-7xl'} mx-auto rounded-lg group relative"
>
	<!-- Sequence ID Tag (Ghost Code Line Number Style) -->
	<div class="absolute right-4 top-0 sm:right-auto sm:left-1 md:-left-6 lg:-left-10 sm:top-5 sm:-translate-y-1/2 text-[10px] text-gray-500 sm:text-gray-600 font-mono opacity-60 sm:opacity-30 group-hover:opacity-100 transition-opacity select-none z-10 pointer-events-none">
		#{String(idx + 1).padStart(4, '0')}
	</div>
	{#if history.messages[messageId]}
		{#if history.messages[messageId].role === 'user'}
			<UserMessage
				{user}
				{chatId}
				{history}
				{messageId}
				isFirstMessage={idx === 0}
				siblings={history.messages[messageId].parentId !== null
					? (history.messages[history.messages[messageId].parentId]?.childrenIds ?? [])
					: (Object.values(history.messages)
							.filter((message) => message.parentId === null)
							.map((message) => message.id) ?? [])}
				{gotoMessage}
				{showPreviousMessage}
				{showNextMessage}
				{editMessage}
				{deleteMessage}
				{readOnly}
				{editCodeBlock}
				{topPadding}
			/>
		{:else if (history.messages[history.messages[messageId].parentId]?.models?.length ?? 1) === 1}
			<ResponseMessage
				{chatId}
				{history}
				{messageId}
				{selectedModels}
				isLastMessage={messageId === history.currentId}
				siblings={history.messages[history.messages[messageId].parentId]?.childrenIds ?? []}
				{setInputText}
				{gotoMessage}
				{showPreviousMessage}
				{showNextMessage}
				{updateChat}
				{editMessage}
				{saveMessage}
				{rateMessage}
				{actionMessage}
				{submitMessage}
				{deleteMessage}
				{continueResponse}
				{regenerateResponse}
				{addMessages}
				{readOnly}
				{editCodeBlock}
				{topPadding}
			/>
		{:else}
			{#key messageId}
				<MultiResponseMessages
					bind:history
					{chatId}
					{messageId}
					{selectedModels}
					isLastMessage={messageId === history?.currentId}
					{setInputText}
					{updateChat}
					{editMessage}
					{saveMessage}
					{rateMessage}
					{actionMessage}
					{submitMessage}
					{deleteMessage}
					{continueResponse}
					{regenerateResponse}
					{mergeResponses}
					{triggerScroll}
					{addMessages}
					{readOnly}
					{editCodeBlock}
					{topPadding}
				/>
			{/key}
		{/if}
	{/if}
</div>
