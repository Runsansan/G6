/**
 * 基于 G 的时间轴组件
 */
import GCanvas from '@antv/g-canvas/lib/canvas';
import GSVGCanvas from '@antv/g-svg/lib/canvas';
import { IGroup, ICanvas } from '@antv/g-base';
import createDOM from '@antv/dom-util/lib/create-dom'
import { isString } from '@antv/util'
import Base, { IPluginBaseConfig } from '../base';
import TrendTimeBar, { SliderOption, VALUE_CHANGE, ControllerCfg } from './trendTimeBar'
import TimeBarSlice, { TimeBarSliceOption } from './timeBarSlice'
import { IGraph } from '../../interface/graph';
import { GraphData, ShapeStyle } from '../../types';
import { Interval } from './trend';

// simple 版本默认高度
const DEFAULT_SIMPLE_HEIGHT = 8

// trend 版本默认高度
const DEFAULT_TREND_HEIGHT = 26

interface Callback {
  originValue: number[];
  value: number[];
  target: IGroup;
}

interface TrendConfig {
   // 数据
  readonly data: {
    date: string;
    value: string;
  }[];
  // 位置大小
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  // 样式
  readonly smooth?: boolean;
  readonly isArea?: boolean;
  readonly backgroundStyle?: ShapeStyle;
  readonly lineStyle?: ShapeStyle;
  readonly areaStyle?: ShapeStyle;
  readonly interval?: Interval;
}

interface TimeBarConfig extends IPluginBaseConfig {
  // position size
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly padding?: number;

  readonly type?: 'trend' | 'simple' | 'slice';
  // 趋势图配置项
  readonly trend?: TrendConfig;
  // 滑块、及前后背景的配置
  readonly slider?: SliderOption;

  // 刻度时间轴配置项
  readonly slice?: TimeBarSliceOption;

  // 控制按钮
  readonly controllerCfg?: ControllerCfg;

  rangeChange?: (graph: IGraph, minValue: string, maxValue: string) => void;
  valueChange?: (graph: IGraph, value: string) => void;
}

export default class TimeBar extends Base {
  private cacheGraphData: GraphData;

  public getDefaultCfgs(): TimeBarConfig {
    return {
      container: null,
      className: 'g6-component-timebar',
      padding: 10,
      type: 'trend',
      trend: {
        data: [],
        isArea: false,
        smooth: true
      },
      controllerCfg: {
        speed: 2,
        loop: false,
      },
      slider: {
        start: 0.1,
        end: 0.9,
        minText: 'min',
        maxText: 'max',
      },
      slice: {
        start: 0.1,
        end: 0.9,
        data: []
      }
    };
  }

  constructor(cfgs?: TimeBarConfig) {
    super(cfgs)
  }

  /**
   * 初始化 TimeBar 的容器
   */
  public initContainer() {
    const graph: IGraph = this.get('graph');
    const { width, height } = this._cfgs
    const className: string = this.get('className') || 'g6-component-timebar';
    let parentNode: string | HTMLElement = this.get('container');
    const container: HTMLElement = createDOM(
      `<div class='${className}' style='position: absolute; width: ${width}px; height: ${height}px;'></div>`,
    );

    if (isString(parentNode)) {
      parentNode = document.getElementById(parentNode) as HTMLElement;
    }

    if (parentNode) {
      parentNode.appendChild(container);
    } else {
      graph.get('container').appendChild(container);
    }

    this.set('container', container);

    let canvas;
    const renderer = graph.get('renderer');
    if (renderer !== 'SVG') {
      canvas = new GSVGCanvas({
        container: container,
        width,
        height,
      });
    } else {
      canvas = new GCanvas({
        container: container,
        width,
        height,
      });
    }
    this.set('canvas', canvas);
  }

  public init() {
    this.initContainer()
    const canvas: ICanvas = this.get('canvas')
    const timeBarGroup = canvas.addGroup({
      name: 'timebar-group'
    })

    this.set('timeBarGroup', timeBarGroup)

    this.renderTrend()
    this.initEvent()
  }

  private renderTrend() {
    const { width, x, y, padding, type, trend, slider, controllerCfg } = this._cfgs
    const { data, ...other } = trend

    const realWidth = width - 2 * padding
    const defaultHeight = type === 'trend' ? DEFAULT_TREND_HEIGHT : DEFAULT_SIMPLE_HEIGHT
    
    const graph = this.get('graph')
    const group = this.get('timeBarGroup')
    const canvas = this.get('canvas')

    let timebar = null
    if (type === 'trend' || type === 'simple') {
      timebar = new TrendTimeBar({
        graph,
        canvas,
        group,
        type,
        x: x + padding,
        y: type === 'trend' ? y + padding : y + padding + 15,
        width: realWidth,
        height: defaultHeight,
        padding,
        trendCfg: {
          ...other,
          data: data.map(d => d.value)
        },
        ...slider,
        ticks: data.map(d => d.date),
        handlerStyle: {
          ...slider.handlerStyle,
          height: slider.height || defaultHeight
        },
        controllerCfg
      })
    } else if (type === 'slice') {
      const { slice } = this._cfgs
      // 刻度时间轴
      timebar = new TimeBarSlice({
        graph,
        canvas,
        group,
        ...slice
      })
    }

    this.set('timebar', timebar)
  }

  private filterData(evt) {
    const { value } = evt;
    debugger
    // TODO 不同类型的 TimeBar 取不同地方的data
    let trendData = null
    const type = this._cfgs.type
    if (type === 'trend' || type === 'simple') {
      trendData = this._cfgs.trend.data
    } else if (type === 'slice') {
      trendData = this._cfgs.slice.data
    }
    // const { data: trendData } = this._cfgs.trend
    const rangeChange = this.get('rangeChange');
    const graph: IGraph = this.get('graph');
    
    const min = Math.round(trendData.length * value[0]);
    let max = Math.round(trendData.length * value[1]);
    max = max >= trendData.length ? trendData.length - 1 : max;
    
    const minText = trendData[min].date;
    const maxText = trendData[max].date;
    
    if (type !== 'slice') {
      const timebar = this.get('timebar');
      timebar.setText(minText, maxText)
    }

    if (rangeChange) {
      rangeChange(graph, minText, maxText);
    } else {
      // 自动过滤数据，并渲染 graph
      const graphData = graph.save() as GraphData;

      if (
        !this.cacheGraphData ||
        (this.cacheGraphData.nodes && this.cacheGraphData.nodes.length === 0)
      ) {
        this.cacheGraphData = graphData;
      }

      // 过滤不在 min 和 max 范围内的节点
      const filterData = this.cacheGraphData.nodes.filter(
        (d: any) => d.date >= minText && d.date <= maxText,
      );

      const nodeIds = filterData.map((node) => node.id);

      // 过滤 source 或 target 不在 min 和 max 范围内的边
      const fileterEdges = this.cacheGraphData.edges.filter(
        (edge) => nodeIds.includes(edge.source) && nodeIds.includes(edge.target),
      );

      graph.changeData({
        nodes: filterData,
        edges: fileterEdges,
      });
    }
  }

  private initEvent() {
    let start = 0
    let end = 0
    const type = this._cfgs.type
    if (!type || type === 'trend' || type === 'simple') {
      start = this._cfgs.slider.start
      end = this._cfgs.slider.end
    } else if (type === 'slice') {
      start = this._cfgs.slice.start
      end = this._cfgs.slice.end
    }

    const graph: IGraph = this.get('graph');
    graph.on('afterrender', () => {
      this.filterData({ value: [start, end] });
    });

    // 时间轴的值发生改变的事件
    graph.on(VALUE_CHANGE, (evt: Callback) => {
      // 范围变化
      if (type === 'trend') {
        // this.filterData(evt);
      } else if (type === 'simple') {
        // 单个值变化
        // this.renderCurrentData('')
      }
      console.log(evt)
    });
  }

  public destroy() {
    super.destroy();
    const group = this.get('timeBarGroup')
    group.off('playPauseBtn:click')
  }
}