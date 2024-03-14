// All the node functionality is in this file
// When building more complex nodes, you should consider splitting out your functionality into modules
import moment from 'moment';
import { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-core';
import {
	IDataObject,
	INodeExecutionData,
	INodeListSearchResult,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

interface Deployment {
	deployment_id: string;
	created_at: string;
	recipe_id: string;
	recipe_name: string;
	schemas: { request_schema: {}; response_schema: {} };
}

interface DeploymentResponse {
	deployments: Deployment[];
}

const API_BASE_URL = 'https://api.prompt.studio/api/v1';

export class PromptStudio implements INodeType {
	methods = {
		listSearch: {
			async searchMethod(
				this: ILoadOptionsFunctions,
				query?: string,
			): Promise<INodeListSearchResult> {
				const res: DeploymentResponse = await this.helpers.requestWithAuthentication.call(
					this,
					'promptStudioApi',
					{
						method: 'GET',
						uri: `${API_BASE_URL}/deployments`,
						json: true,
					},
				);

				const results: { [key: string]: INodePropertyOptions } = res.deployments
					// index by recipe for readability
					.reduce((acc, deployment) => {
						if (!acc[deployment.recipe_id]) {
							acc[deployment.recipe_id] = {
								value: JSON.stringify({
									deployments: [deployment.deployment_id],
									schemas: [deployment.schemas],
									created_at: [deployment.created_at],
								}),
								name: deployment.recipe_name,
							};
						} else {
							acc[deployment.recipe_id].value = JSON.stringify({
								deployments: [
									...JSON.parse(acc[deployment.recipe_id].value as string).deployments,
									deployment.deployment_id,
								],
								schemas: [
									...JSON.parse(acc[deployment.recipe_id].value as string).schemas,
									deployment.schemas,
								],
								created_at: [
									...JSON.parse(acc[deployment.recipe_id].value as string).created_at,
									deployment.created_at,
								],
							});
						}
						return acc;
					}, {} as { [key: string]: INodePropertyOptions });

				return { results: Object.values(results) };
			},
		},
		loadOptions: {
			async loadDeployments(this: ILoadOptionsFunctions): Promise<any> {
				const param = this.getCurrentNodeParameter('recipeId');
				const recipe = JSON.parse((param as any)?.value || '{}');
				const deployments = (recipe.deployments as string[]) || [];
				const created_at = (recipe.created_at as string[]) || [];
				const options = deployments
					.map((deployment, index) => {
						return {
							name: `${moment(created_at[index]).format('YYYY-MM-DD, hh:mm:ss')} - ${deployment}`,
							value: deployment,
						};
					})
					.sort((a, b) => {
						return b.name.localeCompare(a.name);
					});

				return options;
			},
		},
		resourceMapping: {
			async getMappingColumns(this: ILoadOptionsFunctions): Promise<{ fields: any[] }> {
				const param = this.getCurrentNodeParameter('recipeId');
				const recipe = JSON.parse((param as any)?.value || '{}');
				const deployments = (recipe.deployments as string[]) || [];
				const schemas = (recipe.schemas as any[]) || [];
				const deploymentId = this.getCurrentNodeParameter('deploymentId') as string;
				const deploymentIndex = deployments.findIndex((dep) => dep === deploymentId);
				const schema = schemas[deploymentIndex];

				if (!schema?.request_schema) {
					throw new NodeOperationError(
						this.getNode(),
						'No schema found for the selected deployment',
					);
				}

				const fields = Object.keys(schema?.request_schema || {}).map((key) => ({
					id: key,
					displayName: key,
					required: true,
					defaultMatch: true,
					display: true,
					type: 'string',
					canBeUsedToMatch: true,
					readOnly: false,
					removed: false,
				}));
				return { fields };
			},
		},
	} as any; // :(
	description: INodeTypeDescription = {
		// Basic node details will go here
		displayName: 'Prompt Studio',
		name: 'promptStudio',
		icon: 'file:logo.svg',
		group: ['trigger, schedule, transform'],
		version: 1,
		description: 'Run your Prompts',
		defaults: {
			name: 'Prompt Studio',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'promptStudioApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Recipe',
				name: 'recipeId',
				type: 'resourceLocator',
				description: 'Select a recipe',
				required: true,
				default: { mode: 'list', value: '' },
				modes: [
					{
						displayName: 'List',
						name: 'list',
						type: 'list',
						typeOptions: {
							searchListMethod: 'searchMethod',
							searchable: true,
							searchFilterRequired: false,
						},
					},
				],
			},
			{
				displayName: 'Deployment Name or ID',
				name: 'deploymentId',
				type: 'options',
				description:
					'Select a deployment. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code-examples/expressions/">expression</a>.',
				required: true,
				default: '',
				typeOptions: {
					loadOptionsMethod: 'loadDeployments',
					loadOptionsDependsOn: ['recipeId.value'],
				},
				displayOptions: {
					hide: {
						recipeId: [''],
					},
				},
			},
			{
				displayName: 'Inputs',
				name: 'inputs',
				type: 'resourceMapper',
				default: {
					mappingMode: 'defineBelow',
					value: null,
				},
				required: true,
				description: 'Select inputs',
				typeOptions: {
					loadOptionsDependsOn: ['deploymentId', 'recipeId.value'],
					resourceMapper: {
						resourceMapperMethod: 'getMappingColumns',
						mode: 'add',
						fieldWords: {
							singular: 'input',
							plural: 'inputs',
						},
						addAllFields: true,
						multiKeyMatch: true,
						supportAutoMap: false,
					},
				},
				displayOptions: {
					hide: {
						recipeId: [''],
						deploymentId: [''],
					},
				},
			} as any,
		],
	};
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		let responseData: any;
		const returnData: IDataObject[] = [];

		for (let i = 0; i < items.length; i++) {
			const deploymentId = this.getNodeParameter('deploymentId', 0) as string;
			const inputs = this.getNodeParameter('inputs', 0) as IDataObject;

			responseData = await this.helpers.requestWithAuthentication.call(this, 'promptStudioApi', {
				method: 'POST',
				uri: `${API_BASE_URL}/instructions/${deploymentId}/run`,
				json: true,
				body: {
					input: inputs.value,
				},
			});

			returnData.push({
				...responseData,
			});
		}
		return [this.helpers.returnJsonArray(returnData)];
	}
}
