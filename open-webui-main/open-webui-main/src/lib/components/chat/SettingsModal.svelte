<script lang="ts">
	import { getContext, onMount, tick } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { config, models, settings, user } from '$lib/stores';
	import { updateUserSettings } from '$lib/apis/users';
	import { getModels as _getModels } from '$lib/apis';
	import { goto } from '$app/navigation';

	import Modal from '../common/Modal.svelte';
	import Account from './Settings/Account.svelte';
	import About from './Settings/About.svelte';
	import General from './Settings/General.svelte';
	import Interface from './Settings/Interface.svelte';
	import Audio from './Settings/Audio.svelte';
	import DataControls from './Settings/DataControls.svelte';
	import Personalization from './Settings/Personalization.svelte';
	import Search from '../icons/Search.svelte';
	import XMark from '../icons/XMark.svelte';
	import Connections from './Settings/Connections.svelte';
	import Integrations from './Settings/Integrations.svelte';
	import DatabaseSettings from '../icons/DatabaseSettings.svelte';
	import SettingsAlt from '../icons/SettingsAlt.svelte';
	import Link from '../icons/Link.svelte';
	import UserCircle from '../icons/UserCircle.svelte';
	import SoundHigh from '../icons/SoundHigh.svelte';
	import InfoCircle from '../icons/InfoCircle.svelte';
	import WrenchAlt from '../icons/WrenchAlt.svelte';
	import Face from '../icons/Face.svelte';
	import AppNotification from '../icons/AppNotification.svelte';
	import UserBadgeCheck from '../icons/UserBadgeCheck.svelte';

	const i18n = getContext('i18n');

	export let show: boolean | string = false;

	$: if (show) {
		if (typeof show === 'string') {
			selectedTab = show;
			show = true;
		}
		addScrollListener();
	} else {
		selectedTab = 'general';
		removeScrollListener();
	}

	interface SettingsTab {
		id: string;
		title: string;
		keywords: string[];
	}

	const allSettings: SettingsTab[] = [
		{
			id: 'general',
			title: 'General',
			keywords: [
				'advancedparams',
				'advancedparameters',
				'advanced params',
				'advanced parameters',
				'configuration',
				'defaultparameters',
				'default parameters',
				'defaultsettings',
				'default settings',
				'general',
				'keepalive',
				'keep alive',
				'languages',
				'notifications',
				'requestmode',
				'request mode',
				'systemparameters',
				'system parameters',
				'systemprompt',
				'system prompt',
				'systemsettings',
				'system settings',
				'theme',
				'translate',
				'webuisettings',
				'webui settings'
			]
		},
		{
			id: 'interface',
			title: 'Interface',
			keywords: [
				'allow user location',
				'allow voice interruption in call',
				'allowuserlocation',
				'allowvoiceinterruptionincall',
				'always collapse codeblocks',
				'always collapse code blocks',
				'always expand details',
				'always on web search',
				'always play notification sound',
				'alwayscollapsecodeblocks',
				'alwaysexpanddetails',
				'alwaysonwebsearch',
				'alwaysplaynotificationsound',
				'android',
				'auto chat tags',
				'auto copy response to clipboard',
				'auto title',
				'autochattags',
				'autocopyresponsetoclipboard',
				'autotitle',
				'beta',
				'call',
				'chat background image',
				'chat bubble ui',
				'chat direction',
				'chat tags autogen',
				'chat tags autogeneration',
				'chat ui',
				'chatbackgroundimage',
				'chatbubbleui',
				'chatdirection',
				'chat tags autogeneration',
				'chattagsautogeneration',
				'chatui',
				'copy formatted text',
				'copyformattedtext',
				'default model',
				'defaultmodel',
				'design',
				'detect artifacts automatically',
				'detectartifactsautomatically',
				'display emoji in call',
				'display username',
				'displayemojiincall',
				'displayusername',
				'enter key behavior',
				'enterkeybehavior',
				'expand mode',
				'expandmode',
				'file',
				'followup autogeneration',
				'followupautogeneration',
				'fullscreen',
				'fullwidthmode',
				'full width mode',
				'haptic feedback',
				'hapticfeedback',
				'high contrast mode',
				'highcontrastmode',
				'iframe sandbox allow forms',
				'iframe sandbox allow same origin',
				'iframesandboxallowforms',
				'iframesandboxallowsameorigin',
				'imagecompression',
				'image compression',
				'imagemaxcompressionsize',
				'image max compression size',
				'interface customization',
				'interface options',
				'interfacecustomization',
				'interfaceoptions',
				'landing page mode',
				'landingpagemode',
				'layout',
				'left to right',
				'left-to-right',
				'lefttoright',
				'ltr',
				'paste large text as file',
				'pastelargetextasfile',
				'reset background',
				'resetbackground',
				'response auto copy',
				'responseautocopy',
				'rich text input for chat',
				'richtextinputforchat',
				'right to left',
				'right-to-left',
				'righttoleft',
				'rtl',
				'scroll behavior',
				'scroll on branch change',
				'scrollbehavior',
				'scrollonbranchchange',
				'select model',
				'selectmodel',
				'settings',
				'show username',
				'showusername',
				'stream large chunks',
				'streamlargechunks',
				'stylized pdf export',
				'stylizedpdfexport',
				'title autogeneration',
				'titleautogeneration',
				'toast notifications for new updates',
				'toastnotificationsfornewupdates',
				'upload background',
				'uploadbackground',
				'user interface',
				'user location access',
				'userinterface',
				'userlocationaccess',
				'vibration',
				'voice control',
				'voicecontrol',
				'widescreen mode',
				'widescreenmode',
				'whatsnew',
				'whats new',
				'websearchinchat',
				'web search in chat'
			]
		},
		{
			id: 'connections',
			title: 'Connections',
			keywords: [
				'addconnection',
				'add connection',
				'manageconnections',
				'manage connections',
				'manage direct connections',
				'managedirectconnections',
				'settings'
			]
		},
		{
			id: 'tools',
			title: 'Integrations',
			keywords: [
				'addconnection',
				'add connection',
				'integrations',
				'managetools',
				'manage tools',
				'manage tool servers',
				'managetoolservers',
				'open terminal',
				'openterminal',
				'terminal',
				'settings'
			]
		},

		{
			id: 'personalization',
			title: 'Personalization',
			keywords: [
				'account preferences',
				'account settings',
				'accountpreferences',
				'accountsettings',
				'custom settings',
				'customsettings',
				'experimental',
				'memories',
				'memory',
				'personalization',
				'personalize',
				'personal settings',
				'personalsettings',
				'profile',
				'user preferences',
				'userpreferences'
			]
		},
		{
			id: 'audio',
			title: 'Audio',
			keywords: [
				'audio config',
				'audio control',
				'audio features',
				'audio input',
				'audio output',
				'audio playback',
				'audio voice',
				'audioconfig',
				'audiocontrol',
				'audiofeatures',
				'audioinput',
				'audiooutput',
				'audioplayback',
				'audiovoice',
				'auto playback response',
				'autoplaybackresponse',
				'auto transcribe',
				'autotranscribe',
				'instant auto send after voice transcription',
				'instantautosendaftervoicetranscription',
				'language',
				'non local voices',
				'nonlocalvoices',
				'save settings',
				'savesettings',
				'set voice',
				'setvoice',
				'sound settings',
				'soundsettings',
				'speech config',
				'speech mode',
				'speech playback speed',
				'speech rate',
				'speech recognition',
				'speech settings',
				'speech speed',
				'speech synthesis',
				'speech to text engine',
				'speechconfig',
				'speechmode',
				'speechplaybackspeed',
				'speechrate',
				'speechrecognition',
				'speechsettings',
				'speechspeed',
				'speechsynthesis',
				'speechtotextengine',
				'speedch playback rate',
				'speedchplaybackrate',
				'stt settings',
				'sttsettings',
				'text to speech engine',
				'text to speech',
				'textospeechengine',
				'texttospeech',
				'texttospeechvoice',
				'text to speech voice',
				'voice control',
				'voice modes',
				'voice options',
				'voice playback',
				'voice recognition',
				'voice speed',
				'voicecontrol',
				'voicemodes',
				'voiceoptions',
				'voiceplayback',
				'voicerecognition',
				'voicespeed',
				'volume'
			]
		},
		{
			id: 'data_controls',
			title: 'Data Controls',
			keywords: [
				'archive all chats',
				'archive chats',
				'archiveallchats',
				'archivechats',
				'archived chats',
				'archivedchats',
				'chat activity',
				'chat history',
				'chat settings',
				'chatactivity',
				'chathistory',
				'chatsettings',
				'conversation activity',
				'conversation history',
				'conversationactivity',
				'conversationhistory',
				'conversations',
				'convos',
				'delete all chats',
				'delete chats',
				'deleteallchats',
				'deletechats',
				'export chats',
				'exportchats',
				'import chats',
				'importchats',
				'message activity',
				'message archive',
				'message history',
				'messagearchive',
				'messagehistory'
			]
		},
		{
			id: 'account',
			title: 'Account',
			keywords: [
				'account preferences',
				'account settings',
				'accountpreferences',
				'accountsettings',
				'api keys',
				'apikeys',
				'change password',
				'changepassword',
				'jwt token',
				'jwttoken',
				'login',
				'new password',
				'newpassword',
				'notification webhook url',
				'notificationwebhookurl',
				'personal settings',
				'personalsettings',
				'privacy settings',
				'privacysettings',
				'profileavatar',
				'profile avatar',
				'profile details',
				'profile image',
				'profile picture',
				'profiledetails',
				'profileimage',
				'profilepicture',
				'security settings',
				'securitysettings',
				'update account',
				'update password',
				'updateaccount',
				'updatepassword',
				'user account',
				'user data',
				'user preferences',
				'user profile',
				'useraccount',
				'userdata',
				'username',
				'userpreferences',
				'userprofile',
				'webhook url',
				'webhookurl'
			]
		},
		{
			id: 'about',
			title: 'About',
			keywords: [
				'about app',
				'about me',
				'about open webui',
				'about page',
				'about us',
				'aboutapp',
				'aboutme',
				'aboutopenwebui',
				'aboutpage',
				'aboutus',
				'check for updates',
				'checkforupdates',
				'contact',
				'copyright',
				'details',
				'discord',
				'documentation',
				'github',
				'help',
				'information',
				'license',
				'redistributions',
				'release',
				'see whats new',
				'seewhatsnew',
				'settings',
				'software info',
				'softwareinfo',
				'support',
				'terms and conditions',
				'terms of use',
				'termsandconditions',
				'termsofuse',
				'timothy jae ryang baek',
				'timothy j baek',
				'timothyjaeryangbaek',
				'timothyjbaek',
				'twitter',
				'update info',
				'updateinfo',
				'version info',
				'versioninfo'
			]
		}
	];

	let availableSettings = [];
	let filteredSettings = [];

	let search = '';
	let searchDebounceTimeout;

	const getAvailableSettings = () => {
		return allSettings.filter((tab) => {
			if (tab.id === 'connections') {
				return $config?.features?.enable_direct_connections;
			}

			if (tab.id === 'tools') {
				return (
					$user?.role === 'admin' ||
					($user?.role === 'user' && $user?.permissions?.features?.direct_tool_servers)
				);
			}

			if (tab.id === 'interface') {
				return $user?.role === 'admin' || ($user?.permissions?.settings?.interface ?? true);
			}

			if (tab.id === 'personalization') {
				return (
					$config?.features?.enable_memories &&
					($user?.role === 'admin' || ($user?.permissions?.features?.memories ?? true))
				);
			}

			return true;
		});
	};

	const setFilteredSettings = () => {
		filteredSettings = availableSettings
			.filter((tab) => {
				return (
					search === '' ||
					tab.title.toLowerCase().includes(search.toLowerCase().trim()) ||
					tab.keywords.some((keyword) => keyword.includes(search.toLowerCase().trim()))
				);
			})
			.map((tab) => tab.id);

		if (filteredSettings.length > 0 && !filteredSettings.includes(selectedTab)) {
			selectedTab = filteredSettings[0];
		}
	};

	const searchDebounceHandler = () => {
		if (searchDebounceTimeout) {
			clearTimeout(searchDebounceTimeout);
		}

		searchDebounceTimeout = setTimeout(() => {
			setFilteredSettings();
		}, 100);
	};

	const saveSettings = async (updated) => {
		console.log(updated);
		await settings.set({ ...$settings, ...updated });
		await models.set(await getModels());
		await updateUserSettings(localStorage.token, { ui: $settings });
	};

	const getModels = async () => {
		return await _getModels(
			localStorage.token,
			$config?.features?.enable_direct_connections && ($settings?.directConnections ?? null)
		);
	};

	let selectedTab = 'general';

	// Function to handle sideways scrolling
	const scrollHandler = (event) => {
		const settingsTabsContainer = document.getElementById('settings-tabs-container');
		if (settingsTabsContainer) {
			event.preventDefault(); // Prevent default vertical scrolling
			settingsTabsContainer.scrollLeft += event.deltaY; // Scroll sideways
		}
	};

	const addScrollListener = async () => {
		await tick();
		const settingsTabsContainer = document.getElementById('settings-tabs-container');
		if (settingsTabsContainer) {
			settingsTabsContainer.addEventListener('wheel', scrollHandler);
		}
	};

	const removeScrollListener = async () => {
		await tick();
		const settingsTabsContainer = document.getElementById('settings-tabs-container');
		if (settingsTabsContainer) {
			settingsTabsContainer.removeEventListener('wheel', scrollHandler);
		}
	};

	onMount(() => {
		availableSettings = getAvailableSettings();
		setFilteredSettings();

		config.subscribe((configData) => {
			availableSettings = getAvailableSettings();
			setFilteredSettings();
		});
	});
</script>

<Modal
	size="2xl"
	bind:show
	containerClassName="p-2 md:p-5"
	className="gladia-settings-shell !w-[calc(100vw-1rem)] overflow-hidden !rounded-2xl !border !border-gray-700/70 bg-gray-950/95 text-gray-100 shadow-[0_28px_90px_rgba(0,0,0,0.65),0_0_0_1px_rgba(111,76,255,0.08)] backdrop-blur-2xl md:!w-[84rem]"
>
	<div class="gladia-settings-modal relative mx-0 overflow-hidden text-gray-100">
		<div
			class="relative flex justify-between border-b border-gray-800/80 bg-gray-950/90 px-4 pt-4 pb-3 md:px-5"
		>
			<div class="self-center text-lg font-semibold tracking-normal text-gray-100">
				{$i18n.t('Settings')}
			</div>
			<button
				aria-label={$i18n.t('Close settings modal')}
				class="self-center rounded-lg border border-gray-700/70 bg-gray-900/80 p-2 text-gray-400 transition hover:border-primary-500/70 hover:bg-primary-500/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500/70"
				on:click={() => {
					show = false;
				}}
			>
				<XMark className="w-5 h-5"></XMark>
			</button>
		</div>

		<div
			class="flex w-full min-w-0 flex-col bg-[radial-gradient(circle_at_78%_0%,rgba(111,76,255,0.12),transparent_34%),linear-gradient(180deg,#0f1720,#0b0f14)] md:flex-row"
		>
			<div
				role="tablist"
				id="settings-tabs-container"
				class="tabs flex min-w-0 flex-row gap-2 overflow-x-auto border-b border-gray-800/80 bg-gray-950/40 px-3 py-3 text-left text-sm md:w-56 md:flex-none md:flex-col md:gap-1.5 md:border-b-0 md:border-r md:px-3.5 md:py-4 md:min-h-[min(42rem,calc(100dvh-10rem))] md:max-h-[min(42rem,calc(100dvh-10rem))]"
			>
				<div
					class="hidden w-full gap-2 rounded-lg border border-gray-800/90 bg-gray-900/80 px-2.5 py-1.5 shadow-inner backdrop-blur-2xl md:flex"
					id="settings-search"
				>
					<div class="self-center rounded-l-xl bg-transparent text-gray-500">
						<Search
							className="size-3.5"
							strokeWidth={($settings?.highContrastMode ?? false) ? '3' : '1.5'}
						/>
					</div>
					<label class="sr-only" for="search-input-settings-modal">{$i18n.t('Search')}</label>
					<input
						class={`w-full bg-transparent py-1 text-sm text-gray-200 outline-hidden
								${($settings?.highContrastMode ?? false) ? 'placeholder-gray-800' : ''}`}
						bind:value={search}
						id="search-input-settings-modal"
						on:input={searchDebounceHandler}
						placeholder={$i18n.t('Search')}
					/>
				</div>
				{#if filteredSettings.length > 0}
					{#each filteredSettings as tabId (tabId)}
						{#if tabId === 'general'}
							<button
								role="tab"
								aria-controls="tab-general"
								aria-selected={selectedTab === 'general'}
								class={`px-0.5 md:px-2.5 py-1 min-w-fit rounded-xl flex-1 md:flex-none flex text-left transition
								${
									selectedTab === 'general'
										? ($settings?.highContrastMode ?? false)
											? 'dark:bg-gray-800 bg-gray-200'
											: ''
										: ($settings?.highContrastMode ?? false)
											? 'hover:bg-gray-200 dark:hover:bg-gray-800'
											: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'
								}`}
								on:click={() => {
									selectedTab = 'general';
								}}
							>
								<div class=" self-center mr-2">
									<SettingsAlt strokeWidth="2" />
								</div>
								<div class=" self-center">{$i18n.t('General')}</div>
							</button>
						{:else if tabId === 'interface'}
							<button
								role="tab"
								aria-controls="tab-interface"
								aria-selected={selectedTab === 'interface'}
								class={`px-0.5 md:px-2.5 py-1 min-w-fit rounded-xl flex-1 md:flex-none flex text-left transition
								${
									selectedTab === 'interface'
										? ($settings?.highContrastMode ?? false)
											? 'dark:bg-gray-800 bg-gray-200'
											: ''
										: ($settings?.highContrastMode ?? false)
											? 'hover:bg-gray-200 dark:hover:bg-gray-800'
											: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'
								}`}
								on:click={() => {
									selectedTab = 'interface';
								}}
							>
								<div class=" self-center mr-2">
									<AppNotification strokeWidth="2" />
								</div>
								<div class=" self-center">{$i18n.t('Interface')}</div>
							</button>
						{:else if tabId === 'connections'}
							{#if $user?.role === 'admin' || ($user?.role === 'user' && $config?.features?.enable_direct_connections)}
								<button
									role="tab"
									aria-controls="tab-connections"
									aria-selected={selectedTab === 'connections'}
									class={`px-0.5 md:px-2.5 py-1 min-w-fit rounded-xl flex-1 md:flex-none flex text-left transition
								${
									selectedTab === 'connections'
										? ($settings?.highContrastMode ?? false)
											? 'dark:bg-gray-800 bg-gray-200'
											: ''
										: ($settings?.highContrastMode ?? false)
											? 'hover:bg-gray-200 dark:hover:bg-gray-800'
											: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'
								}`}
									on:click={() => {
										selectedTab = 'connections';
									}}
								>
									<div class=" self-center mr-2">
										<Link strokeWidth="2" />
									</div>
									<div class=" self-center">{$i18n.t('Connections')}</div>
								</button>
							{/if}
						{:else if tabId === 'tools'}
							{#if $user?.role === 'admin' || ($user?.role === 'user' && $user?.permissions?.features?.direct_tool_servers)}
								<button
									role="tab"
									aria-controls="tab-tools"
									aria-selected={selectedTab === 'tools'}
									class={`px-0.5 md:px-2.5 py-1 min-w-fit rounded-xl flex-1 md:flex-none flex text-left transition
								${
									selectedTab === 'tools'
										? ($settings?.highContrastMode ?? false)
											? 'dark:bg-gray-800 bg-gray-200'
											: ''
										: ($settings?.highContrastMode ?? false)
											? 'hover:bg-gray-200 dark:hover:bg-gray-800'
											: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'
								}`}
									on:click={() => {
										selectedTab = 'tools';
									}}
								>
									<div class=" self-center mr-2">
										<WrenchAlt strokeWidth="2" />
									</div>
									<div class=" self-center">{$i18n.t('Integrations')}</div>
								</button>
							{/if}
						{:else if tabId === 'personalization'}
							<button
								role="tab"
								aria-controls="tab-personalization"
								aria-selected={selectedTab === 'personalization'}
								class={`px-0.5 md:px-2.5 py-1 min-w-fit rounded-xl flex-1 md:flex-none flex text-left transition
								${
									selectedTab === 'personalization'
										? ($settings?.highContrastMode ?? false)
											? 'dark:bg-gray-800 bg-gray-200'
											: ''
										: ($settings?.highContrastMode ?? false)
											? 'hover:bg-gray-200 dark:hover:bg-gray-800'
											: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'
								}`}
								on:click={() => {
									selectedTab = 'personalization';
								}}
							>
								<div class=" self-center mr-2">
									<Face strokeWidth="2" />
								</div>
								<div class=" self-center">{$i18n.t('Personalization')}</div>
							</button>
						{:else if tabId === 'audio'}
							<button
								role="tab"
								aria-controls="tab-audio"
								aria-selected={selectedTab === 'audio'}
								class={`px-0.5 md:px-2.5 py-1 min-w-fit rounded-xl flex-1 md:flex-none flex text-left transition
								${
									selectedTab === 'audio'
										? ($settings?.highContrastMode ?? false)
											? 'dark:bg-gray-800 bg-gray-200'
											: ''
										: ($settings?.highContrastMode ?? false)
											? 'hover:bg-gray-200 dark:hover:bg-gray-800'
											: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'
								}`}
								on:click={() => {
									selectedTab = 'audio';
								}}
							>
								<div class=" self-center mr-2">
									<SoundHigh strokeWidth="2" />
								</div>
								<div class=" self-center">{$i18n.t('Audio')}</div>
							</button>
						{:else if tabId === 'data_controls'}
							<button
								role="tab"
								aria-controls="tab-data-controls"
								aria-selected={selectedTab === 'data_controls'}
								class={`px-0.5 md:px-2.5 py-1 min-w-fit rounded-xl flex-1 md:flex-none flex text-left transition
								${
									selectedTab === 'data_controls'
										? ($settings?.highContrastMode ?? false)
											? 'dark:bg-gray-800 bg-gray-200'
											: ''
										: ($settings?.highContrastMode ?? false)
											? 'hover:bg-gray-200 dark:hover:bg-gray-800'
											: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'
								}`}
								on:click={() => {
									selectedTab = 'data_controls';
								}}
							>
								<div class=" self-center mr-2">
									<DatabaseSettings strokeWidth="2" />
								</div>
								<div class=" self-center">{$i18n.t('Data Controls')}</div>
							</button>
						{:else if tabId === 'account'}
							<button
								role="tab"
								aria-controls="tab-account"
								aria-selected={selectedTab === 'account'}
								class={`px-0.5 md:px-2.5 py-1 min-w-fit rounded-xl flex-1 md:flex-none flex text-left transition
								${
									selectedTab === 'account'
										? ($settings?.highContrastMode ?? false)
											? 'dark:bg-gray-800 bg-gray-200'
											: ''
										: ($settings?.highContrastMode ?? false)
											? 'hover:bg-gray-200 dark:hover:bg-gray-800'
											: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'
								}`}
								on:click={() => {
									selectedTab = 'account';
								}}
							>
								<div class=" self-center mr-2">
									<UserCircle strokeWidth="2" />
								</div>
								<div class=" self-center">{$i18n.t('Account')}</div>
							</button>
						{:else if tabId === 'about'}
							<button
								role="tab"
								aria-controls="tab-about"
								aria-selected={selectedTab === 'about'}
								class={`px-0.5 md:px-2.5 py-1 min-w-fit rounded-xl flex-1 md:flex-none flex text-left transition
								${
									selectedTab === 'about'
										? ($settings?.highContrastMode ?? false)
											? 'dark:bg-gray-800 bg-gray-200'
											: ''
										: ($settings?.highContrastMode ?? false)
											? 'hover:bg-gray-200 dark:hover:bg-gray-800'
											: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'
								}`}
								on:click={() => {
									selectedTab = 'about';
								}}
							>
								<div class=" self-center mr-2">
									<InfoCircle strokeWidth="2" />
								</div>
								<div class=" self-center">{$i18n.t('About')}</div>
							</button>
						{/if}
					{/each}
				{:else}
					<div class="text-center text-gray-500 mt-4">
						{$i18n.t('No results found')}
					</div>
				{/if}
				{#if $user?.role === 'admin'}
					<a
						href="/admin/settings"
						draggable="false"
						class="px-0.5 md:px-2.5 py-1 min-w-fit rounded-xl flex-1 md:flex-none md:mt-auto flex select-none text-left transition {$settings?.highContrastMode
							? 'hover:bg-gray-200 dark:hover:bg-gray-800'
							: 'text-gray-300 dark:text-gray-600 hover:text-gray-700 dark:hover:text-white'}"
						on:click={async (e) => {
							e.preventDefault();
							await goto('/admin/settings');
							show = false;
						}}
					>
						<div class=" self-center mr-2">
							<UserBadgeCheck strokeWidth="2" />
						</div>
						<div class=" self-center">{$i18n.t('Admin Settings')}</div>
					</a>
				{/if}
			</div>
			<div
				class="gladia-settings-content max-h-[min(42rem,calc(100dvh-10rem))] min-w-0 flex-1 overflow-y-auto px-4 py-4 md:min-h-[min(42rem,calc(100dvh-10rem))] md:px-5"
			>
				{#if selectedTab === 'general'}
					<General
						{getModels}
						{saveSettings}
						on:save={() => {
							toast.success($i18n.t('Settings saved successfully!'));
						}}
					/>
				{:else if selectedTab === 'interface'}
					<Interface
						{saveSettings}
						on:save={() => {
							toast.success($i18n.t('Settings saved successfully!'));
						}}
					/>
				{:else if selectedTab === 'connections'}
					<Connections
						saveSettings={async (updated) => {
							await saveSettings(updated);
							toast.success($i18n.t('Settings saved successfully!'));
						}}
					/>
				{:else if selectedTab === 'tools'}
					<Integrations
						saveSettings={async (updated) => {
							await saveSettings(updated);
							toast.success($i18n.t('Settings saved successfully!'));
						}}
					/>
				{:else if selectedTab === 'personalization'}
					<Personalization
						{saveSettings}
						on:save={() => {
							toast.success($i18n.t('Settings saved successfully!'));
						}}
					/>
				{:else if selectedTab === 'audio'}
					<Audio
						{saveSettings}
						on:save={() => {
							toast.success($i18n.t('Settings saved successfully!'));
						}}
					/>
				{:else if selectedTab === 'data_controls'}
					<DataControls {saveSettings} />
				{:else if selectedTab === 'account'}
					<Account
						{saveSettings}
						saveHandler={() => {
							toast.success($i18n.t('Settings saved successfully!'));
						}}
					/>
				{:else if selectedTab === 'about'}
					<About />
				{/if}
			</div>
		</div>
	</div>
</Modal>

<style>
	.gladia-settings-modal {
		--gladia-bg: #0b0f14;
		--gladia-surface: #0f1720;
		--gladia-surface-soft: #12191f;
		--gladia-border: #162028;
		--gladia-border-strong: #273241;
		--gladia-text: #e6eef6;
		--gladia-muted: #9aa4ad;
		--gladia-primary: #6f4cff;
		--gladia-primary-soft: rgba(111, 76, 255, 0.16);
	}

	input::-webkit-outer-spin-button,
	input::-webkit-inner-spin-button {
		/* display: none; <- Crashes Chrome on hover */
		-webkit-appearance: none;
		margin: 0; /* <-- Apparently some margin are still there even though it's hidden */
	}

	.tabs::-webkit-scrollbar {
		display: none; /* for Chrome, Safari and Opera */
	}

	.tabs {
		-ms-overflow-style: none; /* IE and Edge */
		scrollbar-width: none; /* Firefox */
	}

	input[type='number'] {
		appearance: textfield;
		-moz-appearance: textfield; /* Firefox */
	}

	.gladia-settings-content {
		scrollbar-gutter: stable;
	}

	.gladia-settings-modal :global([role='tab']),
	.gladia-settings-modal :global(#settings-tabs-container > a) {
		min-height: 2.25rem;
		border: 1px solid transparent !important;
		border-radius: 0.5rem !important;
		color: var(--gladia-muted) !important;
		font-weight: 500;
		letter-spacing: 0;
		transition:
			background 160ms ease,
			border-color 160ms ease,
			color 160ms ease,
			box-shadow 160ms ease,
			transform 160ms ease;
	}

	.gladia-settings-modal :global([role='tab']:hover),
	.gladia-settings-modal :global(#settings-tabs-container > a:hover) {
		border-color: rgba(111, 76, 255, 0.34) !important;
		background: rgba(111, 76, 255, 0.08) !important;
		color: var(--gladia-text) !important;
	}

	.gladia-settings-modal :global([role='tab'][aria-selected='true']) {
		border-color: rgba(111, 76, 255, 0.45) !important;
		background:
			linear-gradient(180deg, rgba(111, 76, 255, 0.2), rgba(111, 76, 255, 0.1)),
			var(--gladia-surface-soft) !important;
		color: #ffffff !important;
		box-shadow:
			inset 3px 0 0 var(--gladia-primary),
			0 0 22px rgba(111, 76, 255, 0.1);
	}

	.gladia-settings-modal :global([role='tab'] svg),
	.gladia-settings-modal :global(#settings-tabs-container > a svg) {
		color: currentColor;
		opacity: 0.92;
	}

	.gladia-settings-modal :global(#settings-search input) {
		border: 0 !important;
		background: transparent !important;
		box-shadow: none !important;
		color: var(--gladia-text) !important;
		padding: 0.25rem 0 !important;
	}

	.gladia-settings-modal :global(#settings-search input::placeholder) {
		color: #66726f !important;
	}

	.gladia-settings-modal :global(hr) {
		border-color: rgba(39, 50, 65, 0.72) !important;
	}

	.gladia-settings-modal :global(h1),
	.gladia-settings-modal :global(.font-medium) {
		color: var(--gladia-text);
		letter-spacing: 0;
	}

	.gladia-settings-modal :global(.text-gray-500),
	.gladia-settings-modal :global(.text-gray-400),
	.gladia-settings-modal :global(.dark\:text-gray-500),
	.gladia-settings-modal :global(.dark\:text-gray-600) {
		color: var(--gladia-muted) !important;
	}

	.gladia-settings-modal
		:global(
			input:not([type='range']):not([type='checkbox']):not([type='radio']):not([type='file']):not(
					[hidden]
				)
		),
	.gladia-settings-modal :global(select),
	.gladia-settings-modal :global(textarea) {
		min-height: 2.25rem;
		border: 1px solid rgba(39, 50, 65, 0.86) !important;
		border-radius: 0.5rem !important;
		background: rgba(15, 23, 32, 0.86) !important;
		color: var(--gladia-text) !important;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.035),
			inset 0 12px 28px rgba(0, 0, 0, 0.18) !important;
		transition:
			border-color 160ms ease,
			box-shadow 160ms ease,
			background 160ms ease;
	}

	.gladia-settings-modal
		:global(
			input:not([type='range']):not([type='checkbox']):not([type='radio']):not([type='file']):not(
					[hidden]
				):focus
		),
	.gladia-settings-modal :global(select:focus),
	.gladia-settings-modal :global(textarea:focus) {
		border-color: rgba(111, 76, 255, 0.82) !important;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.04),
			0 0 0 3px rgba(111, 76, 255, 0.18),
			0 0 24px rgba(111, 76, 255, 0.1) !important;
	}

	.gladia-settings-modal :global(input::placeholder),
	.gladia-settings-modal :global(textarea::placeholder) {
		color: #66726f !important;
	}

	.gladia-settings-modal :global(select option) {
		background: var(--gladia-surface);
		color: var(--gladia-text);
	}

	.gladia-settings-modal :global(input[type='range']) {
		width: 100%;
		height: 0.35rem;
		border-radius: 999px;
		accent-color: var(--gladia-primary);
		background: #273241;
		cursor: pointer;
	}

	.gladia-settings-modal :global(input[type='range']::-webkit-slider-runnable-track) {
		height: 0.35rem;
		border-radius: 999px;
		background: linear-gradient(90deg, var(--gladia-primary), #8f73ff);
	}

	.gladia-settings-modal :global(input[type='range']::-webkit-slider-thumb) {
		width: 1rem;
		height: 1rem;
		margin-top: -0.33rem;
		border: 2px solid #c9c0ff;
		border-radius: 999px;
		background: #f5f3ff;
		box-shadow: 0 0 0 4px rgba(111, 76, 255, 0.16);
		appearance: none;
	}

	.gladia-settings-modal :global(input[type='range']::-moz-range-track) {
		height: 0.35rem;
		border-radius: 999px;
		background: #273241;
	}

	.gladia-settings-modal :global(input[type='range']::-moz-range-progress) {
		height: 0.35rem;
		border-radius: 999px;
		background: var(--gladia-primary);
	}

	.gladia-settings-modal :global(input[type='range']::-moz-range-thumb) {
		width: 1rem;
		height: 1rem;
		border: 2px solid #c9c0ff;
		border-radius: 999px;
		background: #f5f3ff;
		box-shadow: 0 0 0 4px rgba(111, 76, 255, 0.16);
	}

	.gladia-settings-modal :global(button:not([role='tab'])) {
		letter-spacing: 0;
		transition:
			background 160ms ease,
			border-color 160ms ease,
			color 160ms ease,
			box-shadow 160ms ease,
			transform 120ms ease;
	}

	.gladia-settings-modal :global(button:not([role='tab']):active) {
		transform: translateY(1px);
	}

	.gladia-settings-modal :global(button[class*='bg-black']),
	.gladia-settings-modal :global(button[class*='dark:bg-white']) {
		border: 1px solid rgba(143, 115, 255, 0.55) !important;
		border-radius: 0.5rem !important;
		background: linear-gradient(180deg, #7a5cff, var(--gladia-primary)) !important;
		color: #ffffff !important;
		box-shadow:
			0 10px 26px rgba(111, 76, 255, 0.24),
			inset 0 1px 0 rgba(255, 255, 255, 0.18) !important;
	}

	.gladia-settings-modal :global(button[class*='bg-black']:hover),
	.gladia-settings-modal :global(button[class*='dark:bg-white']:hover) {
		background: linear-gradient(180deg, #8f73ff, #7557ff) !important;
		box-shadow:
			0 12px 30px rgba(111, 76, 255, 0.32),
			inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
	}

	.gladia-settings-modal :global(button[role='switch']) {
		min-width: 4.25rem;
		justify-content: center;
		border: 1px solid rgba(39, 50, 65, 0.86) !important;
		border-radius: 999px !important;
		background: rgba(15, 23, 32, 0.86) !important;
		color: var(--gladia-muted) !important;
	}

	.gladia-settings-modal :global(button[role='switch'][aria-checked='true']) {
		border-color: rgba(111, 76, 255, 0.7) !important;
		background: rgba(111, 76, 255, 0.16) !important;
		color: #ffffff !important;
	}

	.gladia-settings-modal :global(button:not([role='tab']):focus-visible),
	.gladia-settings-modal :global(a:focus-visible) {
		outline: 2px solid rgba(111, 76, 255, 0.72) !important;
		outline-offset: 2px;
	}

	.gladia-settings-modal :global(.overflow-y-scroll),
	.gladia-settings-modal :global(.overflow-y-auto) {
		scrollbar-color: rgba(111, 76, 255, 0.42) transparent;
	}

	@media (max-width: 767px) {
		.gladia-settings-modal :global([role='tab'][aria-selected='true']) {
			box-shadow:
				inset 0 -3px 0 var(--gladia-primary),
				0 0 22px rgba(111, 76, 255, 0.1);
		}
	}
</style>
